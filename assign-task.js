import { auth, db } from "./firebase.js";
import { toast, setLoading, guardAuth } from "./ui.js";

import {
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  doc,
  getDoc,
  collection,
  query,
  where,
  limit,
  getDocs,
  addDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// ✅ مهم جدًا ل guardAuth
window.authRef = auth;

// ✅ الحماية الأساسية (دخول)
guardAuth({ redirectTo: "index.html", message: "لازم تسجّل دخول." });

const qs = new URLSearchParams(location.search);
const targetUid = (qs.get("uid") || "").trim();

const targetInfo = document.getElementById("targetInfo");
const targetUidEl = document.getElementById("targetUid");
const titleEl = document.getElementById("taskTitle");
const descEl = document.getElementById("taskDesc");
const hoursEl = document.getElementById("taskHours");
const pointsEl = document.getElementById("taskPoints");
const requireEl = document.getElementById("taskRequireProof");
const btn = document.getElementById("btnCreateTask");
const msg = document.getElementById("msg");

function safeNum(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function setMsg(t = "") {
  if (msg) msg.textContent = t;
}

async function checkAdmin(user) {
  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    if (!snap.exists()) return { ok: false, role: null };
    const data = snap.data() || {};
    const role = String(data.role || "").trim();
    const active = data.active === true;
    const allowedRoles = ["admin", "super_admin", "superadmin"];
    return { ok: active && allowedRoles.includes(role), role };
  } catch {
    return { ok: false, role: null };
  }
}

async function loadTarget() {
  if (!targetUid) {
    if (targetInfo) targetInfo.textContent = "❌ UID غير موجود في الرابط.";
    if (btn) btn.disabled = true;
    return;
  }

  if (targetUidEl) targetUidEl.textContent = targetUid;

  try {
    // ✅ الأفضل: نقرأ من pixology_volunteers حسب userUid
    const qy = query(
      collection(db, "pixology_volunteers"),
      where("userUid", "==", targetUid),
      limit(1),
    );
    const snap = await getDocs(qy);

    if (!snap.empty) {
      const v = snap.docs[0].data() || {};
      const label = `${v.name || "متطوع"} • ${v.volunteerId || snap.docs[0].id}`;
      if (targetInfo) targetInfo.textContent = label;
      return;
    }

    // ⚠️ Fallback: users/{uid} (قد يفشل حسب Rules لو مش مسموح)
    try {
      const uSnap = await getDoc(doc(db, "users", targetUid));
      if (uSnap.exists()) {
        const u = uSnap.data() || {};
        if (targetInfo)
          targetInfo.textContent = `${u.displayName || u.email || "مستخدم"}`;
        return;
      }
    } catch {}

    if (targetInfo)
      targetInfo.textContent =
        "⚠️ لم يتم العثور على بيانات المتطوع (لكن يمكن إرسال المهمة).";
  } catch (e) {
    console.error(e);
    if (targetInfo) targetInfo.textContent = "تعذر تحميل بيانات المتطوع.";
  }
}

/**
 * ✅ إشعار الأدمن (اختياري)
 * ملاحظة: استعلام users.role in قد لا يكون مسموح حسب Rules، فخليها Best-effort بدون كسر الصفحة.
 */
async function notifyAdmins(title, message, extra = {}) {
  try {
    const qy = query(
      collection(db, "users"),
      where("active", "==", true),
      where("role", "in", ["admin", "super_admin", "superadmin"]),
      limit(10),
    );
    const snap = await getDocs(qy);

    const adminUids = snap.docs.map((d) => d.id).filter(Boolean);
    for (const uid of adminUids) {
      await addDoc(collection(db, "notifications"), {
        uid,
        title,
        message,
        type: "admin",
        read: false,
        readAt: null,
        createdAt: serverTimestamp(),
        ...extra,
      });
    }
  } catch (e) {
    // ✅ لا تكسر الصفحة لو الRules مانعة
    console.log("notifyAdmins skipped:", e?.message || e);
  }
}

async function createTask() {
  const title = (titleEl?.value || "").trim();
  const description = (descEl?.value || "").trim(); // ✅ unify field name
  const hours = safeNum(hoursEl?.value, 1);
  const points = safeNum(pointsEl?.value, Math.max(1, hours));
  const requireProof = !!(requireEl && requireEl.checked);

  if (!targetUid) return toast("UID غير موجود.", "error");
  if (!title) return toast("اكتب عنوان المهمة.", "warn");
  if (hours < 1) return toast("المدة لازم تكون ساعة أو أكثر.", "warn");
  if (points < 0) return toast("النقاط لازم تكون 0 أو أكثر.", "warn");

  btn && (btn.disabled = true);
  setLoading(true);
  setMsg("");

  try {
    // ✅ MATCH ADMIN.JS + RULES:
    // - assignedTo, title, description, durationHours, points, requireProof, status, assignedAt, createdBy, active
    const taskRef = await addDoc(collection(db, "tasks"), {
      assignedTo: targetUid,
      title,
      description, // ✅ بدل details
      durationHours: hours,
      points,
      requireProof,
      status: "pending",
      assignedAt: serverTimestamp(),
      acceptedAt: null,
      dueAt: null,
      completedAt: null,
      createdBy: auth.currentUser?.uid || "",
      active: true,
    });

    // ✅ notify volunteer
    await addDoc(collection(db, "notifications"), {
      uid: targetUid,
      title: "🧩 لديك مهمة جديدة",
      message: `${title} • مدة: ${hours} ساعة • نقاط: ${points}${requireProof ? " • مطلوب إثبات" : ""}`,
      type: "task_assigned",
      read: false,
      readAt: null,
      createdAt: serverTimestamp(),
      taskId: taskRef.id,
    });

    // ✅ optional admin notify
    notifyAdmins("تم إرسال مهمة", `تم إرسال مهمة لمتطوع (${targetUid}).`, {
      taskId: taskRef.id,
    });

    toast("تم إرسال المهمة ✅", "success");
    setMsg("✅ تم إرسال المهمة.");

    if (titleEl) titleEl.value = "";
    if (descEl) descEl.value = "";
    if (hoursEl) hoursEl.value = "5";
    if (pointsEl) pointsEl.value = "10";
    if (requireEl) requireEl.checked = false;
  } catch (e) {
    console.error(e);
    toast("حصل خطأ أثناء إرسال المهمة.", "error");
    setMsg("❌ حصل خطأ.");
  } finally {
    setLoading(false);
    btn && (btn.disabled = false);
  }
}

btn?.addEventListener("click", createTask);

onAuthStateChanged(auth, async (user) => {
  if (!user) return;

  const res = await checkAdmin(user);
  if (!res.ok) {
    toast("الحساب ليس أدمن.", "error");
    await signOut(auth);
    location.href = "index.html";
    return;
  }

  await loadTarget();
});
