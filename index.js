// index.js (FULL CLEAN VERSION)
import { db, auth } from "./firebase.js";
import { toast, setLoading, escapeHTML, safeUrl } from "./ui.js";

import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  doc,
  setDoc,
  serverTimestamp,
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

/** ✅ اقفل شاشة البداية لو المستخدم اختار قبل كده */
const savedRole = localStorage.getItem(ROLE_KEY);
if (savedRole && startGate) {
  startGate.style.display = "none";
}

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

/** ================== كارت المتطوع ================== */
function cardHTML(v) {
  const imgRaw =
    v.photoData ||
    v.photoURL ||
    v.photoUrl ||
    v.imageUrl ||
    v.image ||
    v.avatar ||
    v.photo ||
    "p.jpg";

  const img = safeUrl(imgRaw, "p.jpg");

  const name = escapeHTML(v.name || "متطوع");
  const hours = Number(v.hours ?? 0);

  const id = escapeHTML(v.volunteerId || v.id || "—");
  const gender = escapeHTML(v.gender || "");

  return `
    <article class="course-card" data-gender="${gender}">
      <div class="course-card__img">
        <img 
          src="${img}" 
          alt="صورة المتطوع ${name}"
          onerror="this.src='p.jpg'"
        />
        <span class="ribbon ribbon--pink">المتطوع</span>
        <span class="price-badge">${hours}<br /><small>ساعات</small></span>
      </div>

      <div class="course-card__body">
        <span class="teacher-tag">${name}</span>
        <div class="course-card__title">${name}</div>
        <p class="course-card__desc">ID: ${id}</p>

        <div class="course-card__meta">
          <span>👤 ${gender || "—"}</span>
        </div>
      </div>
    </article>
  `;
}

/** ================== Render ================== */
function render() {
  if (!grid) return;

  const q = (searchEl?.value || "").trim().toLowerCase();
  const g = (genderEl?.value || "").trim();
  const mode = (gradeEl?.value || "").trim();

  let list = cache.slice();

  if (q) {
    list = list.filter(
      (v) =>
        (v.name || "").toLowerCase().includes(q) ||
        (v.volunteerId || v.id || "").toString().toLowerCase().includes(q),
    );
  }

  if (g) {
    list = list.filter((v) => (v.gender || "") === g);
  }

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

/** ================== Load ================== */
async function load() {
  // ✅ مهم: الصفحة الرئيسية لازم تعرض اللي ينفع المستخدم العادي يشوفه
  // وبحسب قواعدك الحالية: pixology_volunteers القراءة للإدمن فقط
  // فإما:
  // 1) تغيّر القواعد وتسمح read للجميع للمتطوعين المعتمدين
  // أو
  // 2) تخلي الصفحة دي ما تقراش المتطوعين لو مش أدمن
  //
  // هنا هنمشي على الحل الآمن: نجرب نقرأ، ولو اترفضت القواعد نعرض رسالة واضحة

  try {
    const snap = await getDocs(
      query(collection(db, "pixology_volunteers"), where("status","in",["Active","Certified"]),
        orderBy("createdAt", "desc"),
      ),
    );

    cache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    render();
  } catch (e) {
    console.log("load volunteers blocked by rules:", e);
    cache = [];
    render();
  }

  // ✅ عداد Pending: ده للأدمن فقط (المستخدم العادي هيترفض)
  if (reqCount) reqCount.textContent = "—";
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
  } catch {
    toast("فشل تسجيل الدخول");
  }
});

btnLogout?.addEventListener("click", async () => {
  try {
    await signOut(auth);
    toast("تم تسجيل الخروج ✅");
  } catch {
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
  } else {
    if (btnLogin) btnLogin.textContent = "تسجيل / إنشاء حساب";
    if (btnLogout) btnLogout.style.display = "none";
    if (myProfileLink) myProfileLink.style.display = "none";
  }
});

/** ================== Start Gate: تسجيل متطوع/مؤسسة بجوجل ================== */
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

    // ✅ users/{uid}
    // - volunteer: Pending until admin approves
    // - org: active مباشرة
    const fixedType = type === "personal" ? "volunteer" : type; // legacy support

    const base = {
      uid: user.uid,
      role: fixedType, // volunteer | org
      displayName: user.displayName || "",
      email: user.email || "",
      photoURL: user.photoURL || "",
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    };

    const extra =
      fixedType === "volunteer"
        ? { active: false, pending: true }
        : { active: true, pending: false };

    await setDoc(doc(db, "users", user.uid), { ...base, ...extra }, { merge: true });

localStorage.setItem(ROLE_KEY, type);

    if (startGate) startGate.style.display = "none";
    closeMenu();

    if (fixedType === "volunteer") {
      toast("تم تسجيل الدخول ✅ أكمل تقديم طلب التطوع");
      window.location.href = "register.html";
      return;
    }

    toast("تم التسجيل كمؤسسة ✅");
  } catch (err) {
    toast("لم يتم تسجيل الدخول");
    console.log(err);
  }
});

/** ================== Init ================== */
load();