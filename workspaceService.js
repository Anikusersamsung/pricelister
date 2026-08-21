import { db, supabase } from "./firebaseConfig.js";
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  getDoc,
  increment,
  updateDoc,
  query,
  where
} from "firebase/firestore";

// --- Resolve Workspace UID (Gatekeeper logic) ---
export async function getActiveWorkspaceUid(userUid) {
  try {
    const connectionSnap = await getDoc(doc(db, "Connections", userUid));
    if (connectionSnap.exists() && connectionSnap.data().adminUid) {
      return connectionSnap.data().adminUid;
    }
  } catch (err) {
    console.warn("Connection lookup warning:", err);
  }
  return userUid;
}

// --- Create / Initialize Workspace ---
export async function createWorkspace(userUid, { name, description = "", adminEmail = "", currency = "USD" }) {
  const wsRef = doc(db, "Workspaces", userUid);
  const connRef = doc(db, "Connections", userUid);

  const wsData = {
    workspaceId: userUid,
    adminUid: userUid,
    adminEmail: adminEmail,
    name: name.trim(),
    description: description.trim(),
    currency: currency,
    createdAt: Date.now(),
    adminProductCount: 0,
    adminInvoiceCount: 0,
    adminCategoryCount: 0,
    adminClientCount: 0,
    adminBusinessCount: 0,
    adminWorkerCount: 0
  };

  await setDoc(wsRef, wsData, { merge: true });
  await setDoc(connRef, {
    adminUid: userUid,
    userUid: userUid,
    email: adminEmail,
    role: "Admin",
    isOwner: true,
    joinedAt: Date.now()
  }, { merge: true });

  return wsData;
}

// --- Ensure Workspace Exists for Authenticated User ---
export async function ensureWorkspaceExists(workspaceUid, userEmail = "", displayName = "") {
  try {
    const wsRef = doc(db, "Workspaces", workspaceUid);
    const snap = await getDoc(wsRef);
    if (!snap.exists()) {
      const defaultName = displayName 
        ? `${displayName}'s Workspace` 
        : (userEmail ? `${userEmail.split('@')[0]}'s Workspace` : "My Workspace");
        
      await createWorkspace(workspaceUid, {
        name: defaultName,
        description: "Cloud inventory & invoice workspace",
        adminEmail: userEmail
      });
    }
  } catch (err) {
    console.error("ensureWorkspaceExists error:", err);
  }
}

// --- Supabase Image Upload ---
export async function uploadImageToSupabase(file) {
  try {
    const ext = file.name ? file.name.split('.').pop() : 'jpg';
    const fileName = `product_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
    const { data, error } = await supabase.storage
      .from("product_images")
      .upload(fileName, file, { cacheControl: '3600', upsert: false });

    if (error) throw error;

    const { data: publicUrlData } = supabase.storage
      .from("product_images")
      .getPublicUrl(fileName);

    return publicUrlData.publicUrl;
  } catch (err) {
    console.error("Supabase upload failed:", err);
    return null;
  }
}

// --- Realtime Product Sync ---
export function listenToProducts(workspaceUid, callback) {
  const productsRef = collection(db, "Workspaces", workspaceUid, "Products");
  return onSnapshot(productsRef, (snapshot) => {
    const products = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      if (!data.uniqueId) data.uniqueId = doc.id;
      products.push(data);
    });
    callback(products);
  }, (err) => {
    console.error("listenToProducts error:", err);
    callback([]);
  });
}

export async function saveProduct(workspaceUid, product, isNew = false) {
  const docRef = doc(db, "Workspaces", workspaceUid, "Products", product.uniqueId);
  await setDoc(docRef, product, { merge: true });

  if (isNew) {
    try {
      const wsRef = doc(db, "Workspaces", workspaceUid);
      await updateDoc(wsRef, { adminProductCount: increment(1) });
    } catch (e) {
      console.warn("Counter update skipped:", e);
    }
  }
}

export async function deleteProduct(workspaceUid, uniqueId) {
  const docRef = doc(db, "Workspaces", workspaceUid, "Products", uniqueId);
  await deleteDoc(docRef);

  try {
    const wsRef = doc(db, "Workspaces", workspaceUid);
    await updateDoc(wsRef, {
      adminProductCount: increment(-1),
      adminTotalDeleted: increment(1)
    });
  } catch (e) {
    console.warn("Counter update skipped:", e);
  }
}

// --- Realtime Invoices Sync (Client & Business) ---
export function listenToAllInvoices(workspaceUid, callback) {
  let clientInvoices = [];
  let businessInvoices = [];

  const updateCombined = () => {
    const combined = [...clientInvoices, ...businessInvoices];
    callback(combined);
  };

  const clientRef = collection(db, "Workspaces", workspaceUid, "Invoices");
  const unsubClient = onSnapshot(clientRef, (snapshot) => {
    clientInvoices = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      if (!data.uniqueId) data.uniqueId = doc.id;
      data.isBusinessInvoice = false;
      clientInvoices.push(data);
    });
    updateCombined();
  }, (err) => console.error("listen to Invoices error:", err));

  const bizRef = collection(db, "Workspaces", workspaceUid, "BusinessInvoices");
  const unsubBiz = onSnapshot(bizRef, (snapshot) => {
    businessInvoices = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      if (!data.uniqueId) data.uniqueId = doc.id;
      data.isBusinessInvoice = true;
      businessInvoices.push(data);
    });
    updateCombined();
  }, (err) => console.error("listen to BusinessInvoices error:", err));

  return () => {
    unsubClient();
    unsubBiz();
  };
}

export function listenToInvoices(workspaceUid, isBusiness, callback) {
  const colName = isBusiness ? "BusinessInvoices" : "Invoices";
  const invRef = collection(db, "Workspaces", workspaceUid, colName);
  return onSnapshot(invRef, (snapshot) => {
    const list = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      if (!data.uniqueId) data.uniqueId = doc.id;
      data.isBusinessInvoice = isBusiness;
      list.push(data);
    });
    callback(list);
  }, (err) => console.error("listenToInvoices error:", err));
}

export async function saveInvoice(workspaceUid, invoice, isNew = false) {
  const colName = invoice.isBusinessInvoice ? "BusinessInvoices" : "Invoices";
  const docRef = doc(db, "Workspaces", workspaceUid, colName, invoice.uniqueId);
  await setDoc(docRef, invoice, { merge: true });

  if (isNew) {
    try {
      const wsRef = doc(db, "Workspaces", workspaceUid);
      await updateDoc(wsRef, { adminInvoiceCount: increment(1) });
    } catch (e) {
      console.warn("Counter update skipped:", e);
    }
  }
}

export async function deleteInvoice(workspaceUid, uniqueId, isBusiness = false) {
  const colName = isBusiness ? "BusinessInvoices" : "Invoices";
  const docRef = doc(db, "Workspaces", workspaceUid, colName, uniqueId);
  await deleteDoc(docRef);
  try {
    const wsRef = doc(db, "Workspaces", workspaceUid);
    await updateDoc(wsRef, { adminInvoiceCount: increment(-1) });
  } catch (e) {
    console.warn("Counter update skipped:", e);
  }
}

// --- Realtime Categories Sync ---
export function listenToCategories(workspaceUid, callback) {
  const catRef = collection(db, "Workspaces", workspaceUid, "Categories");
  return onSnapshot(catRef, (snapshot) => {
    const list = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      if (!data.uniqueId) data.uniqueId = doc.id;
      list.push(data);
    });
    callback(list);
  }, (err) => console.error("listenToCategories error:", err));
}

export async function saveCategory(workspaceUid, category, isNew = false) {
  const docRef = doc(db, "Workspaces", workspaceUid, "Categories", category.uniqueId);
  await setDoc(docRef, category, { merge: true });

  if (isNew) {
    try {
      const wsRef = doc(db, "Workspaces", workspaceUid);
      await updateDoc(wsRef, { adminCategoryCount: increment(1) });
    } catch (e) {
      console.warn("Counter update skipped:", e);
    }
  }
}

export async function deleteCategory(workspaceUid, uniqueId) {
  const docRef = doc(db, "Workspaces", workspaceUid, "Categories", uniqueId);
  await deleteDoc(docRef);
  try {
    const wsRef = doc(db, "Workspaces", workspaceUid);
    await updateDoc(wsRef, { adminCategoryCount: increment(-1) });
  } catch (e) {
    console.warn("Counter update skipped:", e);
  }
}

// --- Clients (Customers) Sync with isClient flag ---
export function listenToClients(workspaceUid, callback) {
  const ref = collection(db, "Workspaces", workspaceUid, "Clients");
  return onSnapshot(ref, (snapshot) => {
    const list = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      if (!data.uniqueId) data.uniqueId = doc.id;
      list.push(data);
    });
    callback(list);
  }, (err) => console.error("listenToClients error:", err));
}

export async function saveClient(workspaceUid, client, isNew = false) {
  const docRef = doc(db, "Workspaces", workspaceUid, "Clients", client.uniqueId);
  const clientData = {
    ...client,
    isClient: client.isClient !== undefined ? client.isClient : true
  };
  await setDoc(docRef, clientData, { merge: true });

  if (isNew) {
    try {
      const wsRef = doc(db, "Workspaces", workspaceUid);
      await updateDoc(wsRef, { adminClientCount: increment(1) });
    } catch (e) {
      console.warn("Counter update skipped:", e);
    }
  }
}

export async function deleteClient(workspaceUid, uniqueId) {
  const docRef = doc(db, "Workspaces", workspaceUid, "Clients", uniqueId);
  await deleteDoc(docRef);
  try {
    const wsRef = doc(db, "Workspaces", workspaceUid);
    await updateDoc(wsRef, { adminClientCount: increment(-1) });
  } catch (e) {
    console.warn("Counter update skipped:", e);
  }
}

// --- Businesses (BusinessProfile) Sync ---
export function listenToBusinessProfiles(workspaceUid, callback) {
  const ref = collection(db, "Workspaces", workspaceUid, "BusinessProfiles");
  return onSnapshot(ref, (snapshot) => {
    const list = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      if (!data.uniqueId) data.uniqueId = doc.id;
      list.push(data);
    });
    callback(list);
  }, (err) => console.error("listenToBusinessProfiles error:", err));
}

export async function saveBusinessProfile(workspaceUid, profile, isNew = false) {
  const docRef = doc(db, "Workspaces", workspaceUid, "BusinessProfiles", profile.uniqueId);
  await setDoc(docRef, profile, { merge: true });

  if (isNew) {
    try {
      const wsRef = doc(db, "Workspaces", workspaceUid);
      await updateDoc(wsRef, { adminBusinessCount: increment(1) });
    } catch (e) {
      console.warn("Counter update skipped:", e);
    }
  }
}

export async function deleteBusinessProfile(workspaceUid, uniqueId) {
  const docRef = doc(db, "Workspaces", workspaceUid, "BusinessProfiles", uniqueId);
  await deleteDoc(docRef);
  try {
    const wsRef = doc(db, "Workspaces", workspaceUid);
    await updateDoc(wsRef, { adminBusinessCount: increment(-1) });
  } catch (e) {
    console.warn("Counter update skipped:", e);
  }
}

// --- Workers & Workspace Team Management ---
export function listenToWorkers(workspaceUid, callback) {
  const ref = collection(db, "Workspaces", workspaceUid, "Workers");
  return onSnapshot(ref, (snapshot) => {
    const list = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      if (!data.uniqueId) data.uniqueId = doc.id;
      if (!data.appWorkerId) data.appWorkerId = doc.id;
      list.push(data);
    });
    callback(list);
  }, (err) => console.error("listenToWorkers error:", err));
}

export async function addWorker(workspaceUid, workerData) {
  const uniqueId = workerData.uniqueId || `wrk_${Date.now()}`;
  const docRef = doc(db, "Workspaces", workspaceUid, "Workers", uniqueId);
  
  const workerObj = {
    uniqueId,
    appWorkerId: workerData.appWorkerId || `WRK-${Math.floor(1000 + Math.random() * 9000)}`,
    email: workerData.email.trim(),
    name: workerData.name ? workerData.name.trim() : workerData.email.split('@')[0],
    role: workerData.role || "Staff",
    isRestricted: Boolean(workerData.isRestricted),
    canManageProducts: workerData.canManageProducts !== false,
    canCreateInvoices: workerData.canCreateInvoices !== false,
    createdAt: Date.now()
  };

  await setDoc(docRef, workerObj, { merge: true });

  try {
    const wsRef = doc(db, "Workspaces", workspaceUid);
    await updateDoc(wsRef, { adminWorkerCount: increment(1) });
  } catch (e) {
    console.warn("Worker counter skipped:", e);
  }

  return workerObj;
}

export async function deleteWorker(workspaceUid, workerId) {
  const docRef = doc(db, "Workspaces", workspaceUid, "Workers", workerId);
  await deleteDoc(docRef);
  try {
    const wsRef = doc(db, "Workspaces", workspaceUid);
    await updateDoc(wsRef, { adminWorkerCount: increment(-1) });
  } catch (e) {
    console.warn("Worker counter skipped:", e);
  }
}

export async function toggleWorkerRestriction(workspaceUid, workerId, isRestricted) {
  const docRef = doc(db, "Workspaces", workspaceUid, "Workers", workerId);
  await updateDoc(docRef, { isRestricted: isRestricted });
}

export function listenToWorkspaceInfo(workspaceUid, callback) {
  const ref = doc(db, "Workspaces", workspaceUid);
  return onSnapshot(ref, (doc) => {
    if (doc.exists()) callback(doc.data());
  }, (err) => console.error("listenToWorkspaceInfo error:", err));
}
