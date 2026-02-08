// submit-proof.js
import { auth, db, storage } from "./firebase.js";
import { toast, setLoading, guardAuth, throttleAction } from "./ui.js";

window.authRef = auth;
guardAuth({
  redirectTo: "index.html",
  message: "سجّل دخول الأول عشان ترفع إثبات.",
});

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  doc,
  getDoc,
  updateDoc,
  addDoc,
  collection,
  serverTimestamp,
  query,
  where,
  limit,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import {
  ref as sRef,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

/** ================= DOM ================= */
const taskInfo = document.getElementById("taskInfo");
const taskIdEl = document.getElementById("taskIdEl");
const proofFile = document.getElementById("proofFile");
const proofNote = document.getElementById("proofNote");
const btnUpload = document.getElementById("btnUpload");
const msg = document.getElementById("msg");
const previewBox = document.getElementById("previewBox");
const preview = document.getElementById("preview");

/** ================= Params ================= */
const qs = new URLSearchParams(location.search);
const taskId = (qs.get("task") || "").trim();

let loadedTask = null;

function setMsg(t = "") {
  if (!msg) return;
  msg.textContent = t;
}

function escapeHtml(s) {
  return String(s || "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );
}

function showPreview(file) {
  if (!previewBox || !preview) return;
  if (!file) {
    previewBox.style.display = "none";
    preview.innerHTML = "";
    return;
  }

  previewBox.style.display = "block";

  if (file.type === "application/pdf") {
    preview.innerHTML = `
      <div style="font-weight:900">📄 PDF</div>
      <div class="muted" style="margin-top:6px">اسم الملف: ${escapeHtml(file.name)}</div>
      <div class="muted">الحجم: ${(file.size / (1024 * 1024)).toFixed(2)} MB</div>
    `;
    return;
  }

  if (file.type.startsWith("image/")) {
    const url = URL.createObjectURL(file);
    preview.innerHTML = `
      <div style="font-weight:900">🖼️ صورة</div>
      <div class="muted" style="margin-top:6px">اسم الملف: ${escapeHtml(file.name)}</div>
      <div class="muted">الحجم: ${(file.size / (1024 * 1024)).toFixed(2)} MB</div>
      <div style="margin-top:10px">
        <img src="${url}" alt="preview" style="max-width:100%;border-radius:14px;border:1px solid var(--border)" />
      </div>
    `;
    return;
  }

  preview.innerHTML = `<div class="muted">نوع ملف غير مدعوم.</div>`;
}

async function notifyAdmins(title, message, extra = {}) {
  try {
    const qy = query(
      collection(db, "users"),
      where("active", "==", true),
      where("role", "in", ["admin", "super_admin", "superadmin", "superAdmin"]),
      limit(20),
    );
    const snap = await getDocs(qy);
    const adminUids = snap.docs.map((d) => d.id).filter(Boolean);

    await Promise.all(
      adminUids.map((uid) =>
        addDoc(collection(db, "notifications"), {
          uid,
          title,
          message,
          type: "admin",
          read: false,
          readAt: null,
          createdAt: serverTimestamp(),
          ...extra,
        }),
      ),
    );
  } catch (e) {
    console.log("notifyAdmins error", e);
  }
}

async function loadTaskForUser(user) {
  if (!taskId) {
    if (taskInfo) taskInfo.textContent = "❌ Task ID غير موجود في الرابط.";
    if (btnUpload) btnUpload.disabled = true;
    return;
  }
  if (taskIdEl) taskIdEl.textContent = taskId;

  try {
    const ref = doc(db, "tasks", taskId);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      if (taskInfo) taskInfo.textContent = "❌ المهمة غير موجودة.";
      if (btnUpload) btnUpload.disabled = true;
      return;
    }

    const t = snap.data() || {};

    // ✅ تأكيد إنها بتاعته
    if (t.assignedTo !== user.uid) {
      if (taskInfo) taskInfo.textContent = "⛔ هذه المهمة ليست مخصصة لك.";
      if (btnUpload) btnUpload.disabled = true;
      return;
    }

    // ✅ لازم requireProof
    if (t.requireProof !== true) {
      if (taskInfo) taskInfo.textContent = "ℹ️ هذه المهمة لا تتطلب إثبات.";
      if (btnUpload) btnUpload.disabled = true;
      return;
    }

    loadedTask = { id: snap.id, ...t };

    const status = String(t.status || "pending");
    const statusText =
      status === "accepted"
        ? "✅ جارية"
        : status === "proof_submitted"
          ? "📩 تم رفع إثبات"
          : status === "completed"
            ? "🏁 مكتملة"
            : "⏳ معلّقة";

    if (taskInfo) {
      taskInfo.textContent = `${t.title || "مهمة"} • ${statusText} • مدة: ${Number(t.durationHours || 0)} ساعة • نقاط: ${Number(t.points || 0)}`;
    }

    // لو الإثبات مرفوع قبل كده
    if (status === "proof_submitted") {
      setMsg("ℹ️ أنت رفعت إثبات قبل كده. استنى مراجعة الأدمن.");
    }

    if (btnUpload) btnUpload.disabled = false;
  } catch (e) {
    console.error(e);
    if (taskInfo) taskInfo.textContent = "تعذر تحميل بيانات المهمة.";
    if (btnUpload) btnUpload.disabled = true;
  }
}

async function uploadProof(user) {
  if (!loadedTask) return toast("المهمة لم تُحمّل.", "error");
  if (!proofFile?.files?.length) return toast("اختار ملف صورة أو PDF.", "warn");

  const file = proofFile.files[0];

  // حماية بسيطة
  const okType =
    file.type === "application/pdf" || file.type.startsWith("image/");
  if (!okType) return toast("الملف لازم يكون صورة أو PDF.", "error");

  const sizeMB = file.size / (1024 * 1024);
  if (sizeMB > 15) return toast("حجم الملف كبير. أقصى شيء 15MB.", "warn");

  // منع ضغط متكرر
  if (!throttleAction("upload-proof-" + loadedTask.id, 2000)) return;

  setLoading(true);
  setMsg("");

  try {
    const uid = user.uid;
    const now = Date.now();
    const safeName = String(file.name || "proof").replace(/[^\w.\-]+/g, "_");
    const path = `task_proofs/${uid}/${loadedTask.id}/${now}_${safeName}`;

    // 1) Upload to Storage
    const storageRef = sRef(storage, path);
    await uploadBytes(storageRef, file, {
      contentType: file.type || "application/octet-stream",
    });
    const downloadURL = await getDownloadURL(storageRef);

    // 2) Create submission doc
    const note = (proofNote?.value || "").trim();

    const subRef = await addDoc(collection(db, "task_submissions"), {
      uid,
      taskId: loadedTask.id,
      fileUrl: downloadURL,
      filePath: path,
      fileName: file.name || "",
      fileType: file.type || "",
      fileSize: file.size || 0,
      note,
      status: "submitted",
      createdAt: serverTimestamp(),
      reviewedAt: null,
      reviewedBy: null,
      reviewDecision: null, // approved/rejected
    });

    // 3) Update task (ده مسموح للمتطوع حسب rules عندك)
    await updateDoc(doc(db, "tasks", loadedTask.id), {
      proofStatus: "submitted",
      proofSubmissionId: subRef.id,
      proofSubmittedAt: serverTimestamp(),
      status: "proof_submitted",
      updatedAt: serverTimestamp(),
    });

    // ✅ مفيش notifications هنا لأن المتطوع مش مسموح له يكتب Notifications
    toast("تم رفع الإثبات ✅", "success");
    setMsg("✅ تم رفع الإثبات. استنى مراجعة الأدمن من لوحة التحكم.");

    // 4) Notify volunteer
    await addDoc(collection(db, "notifications"), {
      uid,
      title: "📩 تم رفع الإثبات",
      message: `تم رفع إثبات المهمة: ${loadedTask.title || "مهمة"} — في انتظار مراجعة الأدمن.`,
      type: "proof_submitted",
      read: false,
      readAt: null,
      createdAt: serverTimestamp(),
      taskId: loadedTask.id,
      submissionId: subRef.id,
    });

    // 5) Notify admins
    await notifyAdmins(
      "📩 إثبات جديد لمهمة",
      `المتطوع (${uid}) رفع إثبات لمهمة: ${loadedTask.title || "مهمة"}`,
      { taskId: loadedTask.id, submissionId: subRef.id },
    );

    toast("تم رفع الإثبات ✅", "success");
    setMsg("✅ تم رفع الإثبات. استنى مراجعة الأدمن.");

    // Reset UI
    proofFile.value = "";
    if (proofNote) proofNote.value = "";
    showPreview(null);

    // Optional: back to profile after a bit
    setTimeout(() => {
      location.href = "my-profile.html";
    }, 800);
  } catch (e) {
    console.error(e);
    toast("حصل خطأ أثناء رفع الإثبات.", "error");
    setMsg("❌ فشل رفع الإثبات.");
  } finally {
    setLoading(false);
  }
}

/** ================= Events ================= */
proofFile?.addEventListener("change", () => {
  showPreview(proofFile.files?.[0] || null);
});

btnUpload?.addEventListener("click", async () => {
  if (!auth.currentUser) return;
  await uploadProof(auth.currentUser);
});

/** ================= Boot ================= */
onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  await loadTaskForUser(user);
});
