// review-proofs.js
import { auth, db } from "./firebase.js";
import { toast, setLoading, guardAuth } from "./ui.js";

window.authRef = auth;
guardAuth({ redirectTo: "index.html", message: "لازم تسجّل دخول كإدمن." });

import {
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  doc,
  getDoc,
  updateDoc,
  addDoc,
  collection,
  query,
  where,
  getDocs,
  limit,
  serverTimestamp,
  runTransaction,
  increment,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/** DOM */
const listEl = document.getElementById("list");
const statusEl = document.getElementById("filterStatus");
const searchEl = document.getElementById("filterSearch");
const countBox = document.getElementById("countBox");
const btnRefresh = document.getElementById("btnRefresh");

/** ---------- Admin check ---------- */
async function checkAdmin(user) {
  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    if (!snap.exists()) return { ok: false };
    const data = snap.data() || {};
    const role = String(data.role || "").trim();
    const active = data.active === true;
    const allowed = ["admin", "super_admin", "superadmin", "superAdmin"];
    return { ok: active && allowed.includes(role), role };
  } catch {
    return { ok: false };
  }
}

/** ---------- Helpers ---------- */
function fmtDate(v) {
  try {
    if (!v) return "—";
    if (typeof v.toDate === "function")
      return v.toDate().toLocaleString("ar-EG");
    if (typeof v === "string") return new Date(v).toLocaleString("ar-EG");
    return "—";
  } catch {
    return "—";
  }
}

function pickFileUrl(sub) {
  // نحاول نطلع رابط الإثبات بأكثر من شكل
  if (!sub) return "";
  if (sub.fileUrl) return sub.fileUrl;
  if (sub.url) return sub.url;
  if (sub.proofUrl) return sub.proofUrl;

  const att = sub.attachments;
  if (Array.isArray(att) && att.length) {
    const a0 = att[0] || {};
    return a0.url || a0.fileUrl || a0.downloadURL || "";
  }

  if (sub.files && Array.isArray(sub.files) && sub.files[0]) {
    const f0 = sub.files[0] || {};
    return f0.url || f0.fileUrl || f0.downloadURL || "";
  }
  return "";
}

function statusBadge(st) {
  const s = String(st || "pending");
  if (s === "approved") return "✅ مقبول";
  if (s === "rejected") return "⛔ مرفوض";
  return "⏳ معلّق";
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/** ---------- Load submissions ---------- */
let _cache = []; // submissions cache

async function loadSubmissions() {
  if (!listEl) return;
  setLoading(true);
  listEl.innerHTML = `<p class="muted">تحميل...</p>`;

  try {
    const status = (statusEl?.value || "pending").trim();

    // لتفادي مشاكل Index: نجيب بالـ where فقط ونعمل sort/filter محلي
    let qy;
    if (status === "all") {
      qy = query(collection(db, "task_submissions"), limit(200));
    } else {
      qy = query(
        collection(db, "task_submissions"),
        where("status", "==", status),
        limit(200),
      );
    }

    const snap = await getDocs(qy);

    const docs = snap.docs
      .map((d) => ({ id: d.id, ...((d.data && d.data()) || {}) }))
      .sort((a, b) => {
        const ta = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const tb = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return tb - ta;
      });

    _cache = docs;
    renderList();
  } catch (e) {
    console.error(e);
    listEl.innerHTML = `<p class="muted">❌ تعذر تحميل الإثباتات.</p>`;
    toast("تعذر تحميل الإثباتات.", "error");
  } finally {
    setLoading(false);
  }
}

function renderList() {
  if (!listEl) return;

  const q = (searchEl?.value || "").trim().toLowerCase();
  const rows = _cache.filter((x) => {
    if (!q) return true;
    const uid = String(x.uid || x.userUid || "").toLowerCase();
    const taskId = String(x.taskId || "").toLowerCase();
    return uid.includes(q) || taskId.includes(q);
  });

  if (countBox) countBox.textContent = `${rows.length}`;

  if (!rows.length) {
    listEl.innerHTML = `<p class="muted">لا يوجد نتائج.</p>`;
    return;
  }

  listEl.innerHTML = rows
    .map((s) => {
      const uid = s.uid || s.userUid || "—";
      const taskId = s.taskId || "—";
      const st = s.status || "pending";
      const fileUrl = pickFileUrl(s);
      const note = s.note || s.notes || s.message || "";
      const created = fmtDate(s.createdAt);

      return `
        <article class="card" style="padding:14px;border-radius:16px">
          <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap">
            <div style="font-weight:900">🧾 إثبات مهمة</div>
            <div class="muted" style="font-size:12px">${statusBadge(st)}</div>
          </div>

          <div class="muted" style="margin-top:8px;line-height:1.9">
            <div><b>UID:</b> <span style="font-family:ui-monospace,monospace">${escapeHtml(uid)}</span></div>
            <div><b>Task:</b> <span style="font-family:ui-monospace,monospace">${escapeHtml(taskId)}</span></div>
            <div><b>التاريخ:</b> ${escapeHtml(created)}</div>
          </div>

          ${
            fileUrl
              ? `<div style="margin-top:10px">
                  <a class="btn btn--outline" target="_blank" rel="noopener" href="${escapeHtml(fileUrl)}">فتح الإثبات</a>
                </div>`
              : `<div class="muted" style="margin-top:10px">⚠️ لا يوجد رابط ملف واضح داخل الدوك.</div>`
          }

          ${
            note
              ? `<div class="muted" style="margin-top:10px; line-height:1.9">
                  <b>ملاحظة:</b> ${escapeHtml(note)}
                </div>`
              : ""
          }

          <div style="margin-top:12px; display:flex; gap:10px; flex-wrap:wrap">
            ${
              st === "pending"
                ? `
                  <button class="btn btn--solid" type="button" data-act="approve" data-id="${s.id}">✅ قبول</button>
                  <button class="btn btn--outline" type="button" data-act="reject" data-id="${s.id}">⛔ رفض</button>
                `
                : `<span class="muted">تمت المراجعة.</span>`
            }
          </div>
        </article>
      `;
    })
    .join("");
}

/** ---------- Actions (Approve/Reject) ---------- */
async function approveSubmission(subId) {
  if (!auth.currentUser) return;

  setLoading(true);
  try {
    const subRef = doc(db, "task_submissions", subId);

    await runTransaction(db, async (tx) => {
      const subSnap = await tx.get(subRef);
      if (!subSnap.exists()) throw new Error("SUB_NOT_FOUND");
      const sub = subSnap.data() || {};

      const uid = sub.uid || sub.userUid;
      const taskId = sub.taskId;

      if (!uid || !taskId) throw new Error("BAD_SUBMISSION");

      const taskRef = doc(db, "tasks", String(taskId));
      const taskSnap = await tx.get(taskRef);
      const task = taskSnap.exists() ? taskSnap.data() || {} : {};

      const hours = Number(task.durationHours || task.hours || 0) || 0;
      const points = Number(task.points || 0) || 0;

      // 1) update submission
      tx.update(subRef, {
        status: "approved",
        reviewedAt: serverTimestamp(),
        reviewedBy: auth.currentUser.uid,
      });

      // 2) update task (mark completed)
      if (taskSnap.exists()) {
        tx.update(taskRef, {
          status: "completed",
          completedAt: serverTimestamp(),
          active: false,
          proofStatus: "approved",
        });
      }

      // 3) increment stats for user + volunteer doc (best-effort)
      // users/{uid}
      const userRef = doc(db, "users", String(uid));
      const userSnap = await tx.get(userRef);
      if (userSnap.exists()) {
        tx.update(userRef, {
          hours: increment(hours),
          points: increment(points),
          tasksCompleted: increment(1),
          updatedAt: serverTimestamp(),
        });
      }

      // pixology_volunteers (doc may not be same id, we will update outside tx if needed)
      // (داخل tx صعب نعمل query) -> هنسيبها للمرحلة اللي بعد tx كـ best-effort
    });

    // بعد ما ننجح: ابعت إشعار للمتطوع
    const sub = _cache.find((x) => x.id === subId) || {};
    const uid = sub.uid || sub.userUid;
    const taskId = sub.taskId;

    if (uid) {
      await addDoc(collection(db, "notifications"), {
        uid,
        title: "✅ تم اعتماد الإثبات",
        message: `تم اعتماد إثبات مهمة (${taskId || ""}).`,
        type: "proof_approved",
        read: false,
        readAt: null,
        createdAt: serverTimestamp(),
        taskId: taskId || "",
      });
    }

    toast("تم قبول الإثبات ✅", "success");
    await loadSubmissions();
  } catch (e) {
    console.error(e);
    toast("فشل قبول الإثبات.", "error");
  } finally {
    setLoading(false);
  }
}

async function rejectSubmission(subId) {
  if (!auth.currentUser) return;

  const reason = prompt("اكتب سبب الرفض (اختياري):") || "";

  setLoading(true);
  try {
    const subRef = doc(db, "task_submissions", subId);

    const subSnap = await getDoc(subRef);
    if (!subSnap.exists()) throw new Error("SUB_NOT_FOUND");
    const sub = subSnap.data() || {};
    const uid = sub.uid || sub.userUid;
    const taskId = sub.taskId;

    await updateDoc(subRef, {
      status: "rejected",
      rejectReason: reason.trim(),
      reviewedAt: serverTimestamp(),
      reviewedBy: auth.currentUser.uid,
    });

    // حدّث التاسك proofStatus (لو موجود)
    if (taskId) {
      try {
        await updateDoc(doc(db, "tasks", String(taskId)), {
          proofStatus: "rejected",
        });
      } catch {}
    }

    // إشعار للمتطوع
    if (uid) {
      await addDoc(collection(db, "notifications"), {
        uid,
        title: "⛔ تم رفض الإثبات",
        message: reason
          ? `سبب الرفض: ${reason}`
          : "تم رفض الإثبات. ارفع إثبات صحيح وحاول مرة أخرى.",
        type: "proof_rejected",
        read: false,
        readAt: null,
        createdAt: serverTimestamp(),
        taskId: taskId || "",
      });
    }

    toast("تم رفض الإثبات ⛔", "warn");
    await loadSubmissions();
  } catch (e) {
    console.error(e);
    toast("فشل رفض الإثبات.", "error");
  } finally {
    setLoading(false);
  }
}

/** Events */
listEl?.addEventListener("click", async (e) => {
  const btn = e.target?.closest?.("button[data-act]");
  if (!btn) return;

  const act = btn.getAttribute("data-act");
  const id = btn.getAttribute("data-id");
  if (!id) return;

  btn.disabled = true;
  try {
    if (act === "approve") await approveSubmission(id);
    if (act === "reject") await rejectSubmission(id);
  } finally {
    btn.disabled = false;
  }
});

statusEl?.addEventListener("change", loadSubmissions);
searchEl?.addEventListener("input", renderList);
btnRefresh?.addEventListener("click", loadSubmissions);

/** Boot */
onAuthStateChanged(auth, async (user) => {
  if (!user) return;

  const res = await checkAdmin(user);
  if (!res.ok) {
    toast("الحساب ليس أدمن.", "error");
    await signOut(auth);
    location.href = "index.html";
    return;
  }

  await loadSubmissions();
});
