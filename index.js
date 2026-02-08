// ===============================
// index.js (FIXED + SAFE VERSION)
// - No white screen
// - Public listing from public_volunteers
// - Graceful fallback + clear error
// ===============================

function showError(msg) {
  const el = document.getElementById("appError") || document.body;
  const box = document.createElement("div");
  box.style.cssText =
    "position:fixed;inset:20px;max-width:720px;margin:auto;height:max-content;padding:16px;border:1px solid #ffb4b4;background:#fff3f3;color:#7a0000;border-radius:12px;font-family:system-ui;z-index:99999";
  box.innerHTML = `<b>تنبيه</b><div style="margin-top:8px">${msg}</div>`;
  el.appendChild(box);
}

import { db, auth } from "./firebase.js";
import { toast } from "./ui.js";

import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  doc,
  setDoc,
  serverTimestamp,
  limit,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import {
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

/** ================== DOM ================== */
const myProfileLink = document.getElementById("myProfileLink");

const grid = document.getElementById("volGrid");
const resultCount = document.getElementById("resultCount");
const volCount = document.getElementById("volCount");
const reqCount = document.getElementById("reqCount");

const searchEl = document.getElementById("courseSearch");
const genderEl = document.getElementById("filterGender");
const gradeEl = document.getElementById("filterGrade");
const clearBtn = document.getElementById("clearFilters");

const btnLogin = document.getElementById("btnLogin");
const btnLogout = document.getElementById("btnLogout");

const loginMenu = document.getElementById("loginMenu");
const loginGoogle = document.getElementById("loginGoogle");

const startGate = document.getElementById("startGate");

const ROLE_KEY = "pix_role";

// ✅ فتح مباشر: اخفاء شاشة الاختيار
if (startGate) startGate.style.display = "none";

// ✅ مهم جدًا: تعريف الكاش (حل ReferenceError)
let cache = [];

/** ================== Helpers ================== */
function toggle(el, show) {
  if (!el) return;
  el.style.display = show ? "block" : "none";
}

function toggleMenu() {
  if (!loginMenu) return;
  const isOpen = loginMenu.style.display === "block";
  toggle(loginMenu, !isOpen);
}

function closeMenu() {
  toggle(loginMenu, false);
}

/** ================== Card ================== */
function cardHTML(v) {
  const img =
    v.photoData ||
    v.photoURL ||
    v.photoUrl ||
    v.imageUrl ||
    v.image ||
    v.avatar ||
    v.photo ||
    "p.jpg";

  const name = v.name || "متطوع";
  const hours = Number(v.hours ?? 0);

  // ✅ لازم يبقى في ID ثابت للروابط
  const id = v.uid || v.volunteerId || v.id || "—";

  const gender = v.gender || "";

  return `
    <article class="course-card" data-gender="${gender}">
      <div class="course-card__img">
        <img
          src="${img}"
          alt="صورة المتطوع ${name}"
          onerror="this.src='p.jpg'"
          loading="lazy"
        />
        <span class="ribbon ribbon--pink">المتطوع</span>
        <span class="price-badge">${hours}<br /><small>ساعات</small></span>
      </div>

      <div class="course-card__body">
        <span class="teacher-tag">${name}</span>
        <div class="course-card__title">${name}</div>
        <p class="course-card__desc">ID: ${id}</p>

        <div class="actions">
          <a class="btn btn--outline" href="volunteer.html?id=${encodeURIComponent(id)}">
            الدخول للملف الشخصي
          </a>
          <a class="btn btn--solid" href="verify.html?id=${encodeURIComponent(id)}">
            Verify
          </a>
        </div>
      </div>
    </article>
  `;
}

/** ================== Render ================== */
function render() {
  if (!grid) return;

  const qText = (searchEl?.value || "").trim().toLowerCase();
  const g = (genderEl?.value || "").trim();
  const mode = (gradeEl?.value || "").trim();

  let list = cache.slice();

  if (qText) {
    list = list.filter((v) => {
      const name = (v.name || "").toLowerCase();
      const id = (v.uid || v.volunteerId || v.id || "")
        .toString()
        .toLowerCase();
      return name.includes(qText) || id.includes(qText);
    });
  }

  if (g) list = list.filter((v) => (v.gender || "") === g);

  if (mode === "اكبر عدد ساعات") {
    list.sort((a, b) => Number(b.hours || 0) - Number(a.hours || 0));
  } else if (mode === "اقل عدد ساعات") {
    list.sort((a, b) => Number(a.hours || 0) - Number(b.hours || 0));
  }

  grid.innerHTML = list.length
    ? list.map(cardHTML).join("")
    : `<p class="muted">لا يوجد متطوعين معتمدين بعد.</p>`;

  if (resultCount) resultCount.textContent = String(list.length);
  if (volCount) volCount.textContent = String(cache.length);
}

/** ================== Load Volunteers (PUBLIC SAFE) ================== */
async function loadPublicVolunteers() {
  try {
    let snap;

    try {
      const q = query(
        collection(db, "public_volunteers"),
        orderBy("createdAt", "desc"),
        limit(60),
      );
      snap = await getDocs(q);
    } catch (orderErr) {
      console.warn("public_volunteers orderBy fallback:", orderErr);
      snap = await getDocs(
        query(collection(db, "public_volunteers"), limit(60)),
      );
    }

    cache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    render();

    if (reqCount) reqCount.textContent = "—";
  } catch (e) {
    console.error("loadPublicVolunteers error:", e);

    cache = []; // ✅ مهم
    render();

    showError(
      "تعذر تحميل المتطوعين. تأكد إن Rules الخاصة بـ public_volunteers مضافة وإن الكوليكشن موجود وفيه بيانات.",
    );
  }
}

/** ================== (Optional) Admin-only Pending Count ================== */
async function loadPendingCountIfAdmin() {
  try {
    if (!auth.currentUser) return;

    const snap = await getDocs(
      query(
        collection(db, "volunteer_requests"),
        where("status", "==", "pending"),
        limit(50),
      ),
    );

    if (reqCount) reqCount.textContent = String(snap.size);
  } catch (e) {
    if (reqCount) reqCount.textContent = "—";
  }
}

/** ================== Events ================== */
searchEl?.addEventListener("input", render);
genderEl?.addEventListener("change", render);
gradeEl?.addEventListener("change", render);

clearBtn?.addEventListener("click", () => {
  if (searchEl) searchEl.value = "";
  if (genderEl) genderEl.value = "";
  if (gradeEl) gradeEl.value = "";
  render();
});

/** ================== Login Menu ================== */
btnLogin?.addEventListener("click", (e) => {
  e.stopPropagation();
  toggleMenu();
});

document.addEventListener("click", (e) => {
  const target = e.target;
  if (!target) return;

  const clickedInsideMenu = loginMenu?.contains(target);
  const clickedLoginBtn = btnLogin?.contains(target);

  if (!clickedInsideMenu && !clickedLoginBtn) closeMenu();
});

loginGoogle?.addEventListener("click", async () => {
  try {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
    closeMenu();
    toast("تم تسجيل الدخول بحساب Google ✅");
  } catch (err) {
    console.error(err);
    toast("فشل تسجيل الدخول");
  }
});

btnLogout?.addEventListener("click", async () => {
  try {
    await signOut(auth);
    toast("تم تسجيل الخروج ✅");
  } catch (err) {
    console.error(err);
    toast("فشل تسجيل الخروج");
  }
});

myProfileLink?.addEventListener("click", (e) => {
  if (!auth.currentUser) {
    e.preventDefault();
    toast("لازم تسجل / تنشئ حساب الأول ✅");
    toggle(loginMenu, true);
  }
});

/** ================== Auth State ================== */
onAuthStateChanged(auth, (user) => {
  if (user) {
    if (btnLogin) {
      btnLogin.textContent =
        "حسابي: " + (user.displayName || user.email || "User");
    }
    if (btnLogout) btnLogout.style.display = "inline-flex";
    if (myProfileLink) myProfileLink.style.display = "inline-flex";

    loadPendingCountIfAdmin();
  } else {
    if (btnLogin) btnLogin.textContent = "تسجيل / إنشاء حساب";
    if (btnLogout) btnLogout.style.display = "none";
    if (myProfileLink) myProfileLink.style.display = "none";
    if (reqCount) reqCount.textContent = "—";
  }
});

/** ================== (Gate Listener kept, but gate hidden) ================== */
startGate?.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-type]");
  if (!btn) return;

  const type = btn.dataset.type; // volunteer | org

  try {
    let user = auth.currentUser;

    if (!user) {
      const provider = new GoogleAuthProvider();
      const cred = await signInWithPopup(auth, provider);
      user = cred.user;
    }

    await setDoc(
      doc(db, "users", user.uid),
      {
        uid: user.uid,
        role: type,
        active: true,
        displayName: user.displayName || "",
        email: user.email || "",
        photoURL: user.photoURL || "",
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      },
      { merge: true },
    );

    localStorage.setItem(ROLE_KEY, type);

    if (startGate) startGate.style.display = "none";
    closeMenu();

    toast(type === "org" ? "تم التسجيل كمؤسسة ✅" : "تم التسجيل كمتطوع ✅");
  } catch (err) {
    console.log(err);
    toast("لم يتم تسجيل الدخول");
  }
});

/** ================== Init ================== */
loadPublicVolunteers();
