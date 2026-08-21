import { db, supabase } from "./firebaseConfig.js";
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  getDoc,
  increment,
  updateDoc
} from "firebase/firestore";

// --- Resolve Workspace UID (Gatekeeper logic) ---
export async function getActiveWorkspaceUid(userUid) {
  const connectionSnap = await getDoc(doc(db, "Connections", userUid));
  if (connectionSnap.exists() && connectionSnap.data().adminUid) {
    return connectionSnap.data().adminUid;
  }
  return userUid;
}

// --- Supabase Image Upload ---
export async function uploadImageToSupabase(file) {
  try {
    const fileName = `product_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.jpg`;
    const { data, error } = await supabase.storage
      .from("product_images")
      .upload(fileName, file);

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
    snapshot.forEach((doc) => products.push(doc.data()));
    callback(products);
  });
}

export async function saveProduct(workspaceUid, product, isNew = false) {
  const docRef = doc(db, "Workspaces", workspaceUid, "Products", product.uniqueId);
  await setDoc(docRef, product, { merge: true });

  if (isNew) {
    const wsRef = doc(db, "Workspaces", workspaceUid);
    await updateDoc(wsRef, { adminProductCount: increment(1) });
  }
}

export async function deleteProduct(workspaceUid, uniqueId) {
  const docRef = doc(db, "Workspaces", workspaceUid, "Products", uniqueId);
  await deleteDoc(docRef);

  const wsRef = doc(db, "Workspaces", workspaceUid);
  await updateDoc(wsRef, {
    adminProductCount: increment(-1),
    adminTotalDeleted: increment(1)
  });
}

// --- Realtime Invoices Sync ---
export function listenToInvoices(workspaceUid, isBusiness, callback) {
  const colName = isBusiness ? "BusinessInvoices" : "Invoices";
  const invRef = collection(db, "Workspaces", workspaceUid, colName);
  return onSnapshot(invRef, (snapshot) => {
    const list = [];
    snapshot.forEach((doc) => list.push(doc.data()));
    callback(list);
  });
}

export async function saveInvoice(workspaceUid, invoice, isNew = false) {
  const colName = invoice.isBusinessInvoice ? "BusinessInvoices" : "Invoices";
  const docRef = doc(db, "Workspaces", workspaceUid, colName, invoice.uniqueId);
  await setDoc(docRef, invoice, { merge: true });

  if (isNew) {
    const wsRef = doc(db, "Workspaces", workspaceUid);
    await updateDoc(wsRef, { adminInvoiceCount: increment(1) });
  }
}

export async function deleteInvoice(workspaceUid, uniqueId, isBusiness = false) {
  const colName = isBusiness ? "BusinessInvoices" : "Invoices";
  const docRef = doc(db, "Workspaces", workspaceUid, colName, uniqueId);
  await deleteDoc(docRef);
  const wsRef = doc(db, "Workspaces", workspaceUid);
  await updateDoc(wsRef, { adminInvoiceCount: increment(-1) });
}

// --- Realtime Categories Sync ---
export function listenToCategories(workspaceUid, callback) {
  const catRef = collection(db, "Workspaces", workspaceUid, "Categories");
  return onSnapshot(catRef, (snapshot) => {
    const list = [];
    snapshot.forEach((doc) => list.push(doc.data()));
    callback(list);
  });
}

export async function saveCategory(workspaceUid, category, isNew = false) {
  const docRef = doc(db, "Workspaces", workspaceUid, "Categories", category.uniqueId);
  await setDoc(docRef, category, { merge: true });

  if (isNew) {
    const wsRef = doc(db, "Workspaces", workspaceUid);
    await updateDoc(wsRef, { adminCategoryCount: increment(1) });
  }
}

export async function deleteCategory(workspaceUid, uniqueId) {
  const docRef = doc(db, "Workspaces", workspaceUid, "Categories", uniqueId);
  await deleteDoc(docRef);
  const wsRef = doc(db, "Workspaces", workspaceUid);
  await updateDoc(wsRef, { adminCategoryCount: increment(-1) });
}

// --- Clients Sync ---
export function listenToClients(workspaceUid, callback) {
  const ref = collection(db, "Workspaces", workspaceUid, "Clients");
  return onSnapshot(ref, (snapshot) => {
    const list = [];
    snapshot.forEach((doc) => list.push(doc.data()));
    callback(list);
  });
}

export async function saveClient(workspaceUid, client, isNew = false) {
  const docRef = doc(db, "Workspaces", workspaceUid, "Clients", client.uniqueId);
  await setDoc(docRef, client, { merge: true });

  if (isNew) {
    const wsRef = doc(db, "Workspaces", workspaceUid);
    await updateDoc(wsRef, { adminClientCount: increment(1) });
  }
}

export async function deleteClient(workspaceUid, uniqueId) {
  const docRef = doc(db, "Workspaces", workspaceUid, "Clients", uniqueId);
  await deleteDoc(docRef);
  const wsRef = doc(db, "Workspaces", workspaceUid);
  await updateDoc(wsRef, { adminClientCount: increment(-1) });
}

// --- Businesses (BusinessProfile) Sync ---
export function listenToBusinessProfiles(workspaceUid, callback) {
  const ref = collection(db, "Workspaces", workspaceUid, "BusinessProfiles");
  return onSnapshot(ref, (snapshot) => {
    const list = [];
    snapshot.forEach((doc) => list.push(doc.data()));
    callback(list);
  });
}

export async function saveBusinessProfile(workspaceUid, profile, isNew = false) {
  const docRef = doc(db, "Workspaces", workspaceUid, "BusinessProfiles", profile.uniqueId);
  await setDoc(docRef, profile, { merge: true });

  if (isNew) {
    const wsRef = doc(db, "Workspaces", workspaceUid);
    await updateDoc(wsRef, { adminBusinessCount: increment(1) });
  }
}

export async function deleteBusinessProfile(workspaceUid, uniqueId) {
  const docRef = doc(db, "Workspaces", workspaceUid, "BusinessProfiles", uniqueId);
  await deleteDoc(docRef);
  const wsRef = doc(db, "Workspaces", workspaceUid);
  await updateDoc(wsRef, { adminBusinessCount: increment(-1) });
}

// --- Workers & Workspace Management Sync ---
export function listenToWorkers(workspaceUid, callback) {
  const ref = collection(db, "Workspaces", workspaceUid, "Workers");
  return onSnapshot(ref, (snapshot) => {
    const list = [];
    snapshot.forEach((doc) => list.push(doc.data()));
    callback(list);
  });
}

export function listenToWorkspaceInfo(workspaceUid, callback) {
  const ref = doc(db, "Workspaces", workspaceUid);
  return onSnapshot(ref, (doc) => {
    if (doc.exists()) callback(doc.data());
  });
}
