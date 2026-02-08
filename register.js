import { auth } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { toast, throttleAction } from "./ui.js";

import { db } from "./firebase.js";
import {
  addDoc,
  collection,
  serverTimestamp,
  query,
  where,
  getDocs,
  limit,
  doc,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import { signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

console.log("REGISTER PROJECT:", db.app.options.projectId);

/** ✅ حماية الصفحة: ممنوع الدخول بدون تسجيل */
onAuthStateChanged(auth, (user) => {
  if (!user) {
    toast("لازم تسجل دخول بحساب حقيقي الأول ✅");
    window.location.replace("index.html");
  }
});

/** ================== DOM ================== */
const form = document.getElementById("regForm");
const msg = document.getElementById("msg");
const submitBtn = document.getElementById("submitBtn");

const successCard = document.getElementById("successCard");
const scName = document.getElementById("scName");
const scPhone = document.getElementById("scPhone");

const photoFileEl = document.getElementById("photoFile");

const btnLogout = document.getElementById("btnLogout");

/** ================== Helpers ================== */
const norm = (v) => String(v ?? "").trim();
const digitsOnly = (s) => String(s ?? "").replace(/\D/g, "");

function showErr(text) {
  if (msg) msg.textContent = text;
}

// ✅ setLoading محلي (بدون تعارض مع ui.js)
function setLoadingBtn(isLoading) {
  if (!submitBtn) return;
  submitBtn.disabled = isLoading;
  submitBtn.textContent = isLoading ? "جارٍ الإرسال..." : "إرسال الطلب";
}

/** ✅ تحويل الصورة إلى Base64 بعد تصغيرها لتفادي حد Firestore */
async function fileToSmallDataURL(file, maxSize = 360, quality = 0.7) {
  if (!file) return "";

  if (!file.type.startsWith("image/")) {
    throw new Error("❌ لازم تختار صورة (JPG/PNG)");
  }

  const maxOriginalMB = 5;
  if (file.size > maxOriginalMB * 1024 * 1024) {
    throw new Error("❌ الصورة كبيرة جدًا (أقصى 5MB)");
  }

  const url = URL.createObjectURL(file);

  try {
    const img = await new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = reject;
      im.src = url;
    });

    let { width, height } = img;
    const ratio = Math.min(maxSize / width, maxSize / height, 1);
    width = Math.max(1, Math.round(width * ratio));
    height = Math.max(1, Math.round(height * ratio));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, width, height);

    const dataUrl = canvas.toDataURL("image/jpeg", quality);

    if (dataUrl.length > 650_000) {
      return canvas.toDataURL("image/jpeg", 0.6);
    }

    return dataUrl;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** ✅ منع تكرار الطلبات عالميًا: نفس (الدولة + الرقم) */
async function checkDuplicateByPhoneKey(phoneKey) {
  const qy = query(
    collection(db, "volunteer_requests"),
    where("phoneKey", "==", phoneKey),
    limit(5),
  );

  const snap = await getDocs(qy);
  if (snap.empty) return { exists: false };

  const found = snap.docs
    .map((d) => d.data() || {})
    .find((d) => ["Pending", "Approved"].includes(d.status));

  if (!found) return { exists: false };
  return { exists: true, status: found.status || "Pending" };
}

/** ================== Submit ================== */
form?.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!throttleAction("register-submit", 4000)) {
    toast("استنى ثواني وجرب تاني.", "warn");
    return;
  }

  if (msg) msg.textContent = "";
  if (successCard) successCard.style.display = "none";

  const name = norm(document.getElementById("name")?.value);
  const phoneRaw = norm(document.getElementById("phone")?.value);
  const gender = norm(document.getElementById("gender")?.value);
  const joinedAt = norm(document.getElementById("joinedAt")?.value);
  const countryRaw = norm(document.getElementById("country")?.value);
  const notes = norm(document.getElementById("notes")?.value);

  const phoneDigits = digitsOnly(phoneRaw);

  const countryKey = countryRaw
    ? countryRaw.toLowerCase().replace(/\s+/g, " ").trim()
    : "unknown";

  const phoneKey = `${countryKey}:${phoneDigits}`;

  if (!name || !phoneRaw || !gender || !joinedAt) {
    showErr("❌ املأ كل الحقول المطلوبة (*)");
    return;
  }

  if (phoneDigits.length < 6 || phoneDigits.length > 15) {
    showErr("❌ رقم الهاتف غير صحيح (اكتب رقم صحيح مع كود الدولة لو متاح)");
    return;
  }

  setLoadingBtn(true);

  try {
    const dup = await checkDuplicateByPhoneKey(phoneKey);
    if (dup.exists) {
      if (dup.status === "Approved") {
        showErr(
          "✅ أنت بالفعل متطوع مُعتمد. لا يمكن إرسال طلب جديد بنفس الرقم.",
        );
      } else {
        showErr("✅ تم استلام طلبك بالفعل وهو قيد المراجعة (Pending).");
      }
      return;
    }

    const file = photoFileEl?.files?.[0] || null;
    const photoData = file ? await fileToSmallDataURL(file) : "";

    const user = auth.currentUser;
    const uid = user?.uid || "";
    const email = user?.email || "";

    await addDoc(collection(db, "volunteer_requests"), {
      uid,
      email,
      name,

      phoneRaw,
      phoneDigits,
      phoneKey,

      gender,
      joinedAt,
      country: countryRaw,
      countryKey,

      notes,

      photoData,
      photoName: file?.name || "",
      photoType: file?.type || "",

      status: "Pending",
      organization: "Pixology Foundation",
      createdAt: serverTimestamp(),
    });

    // ✅ حدّث ملف المستخدم: Pending
    if (uid) {
      await setDoc(
        doc(db, "users", uid),
        {
          email,
          displayName: name,
          role: "pending_volunteer",
          active: false,
          pending: true,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    }

    if (msg)
      msg.textContent =
        "✅ تم إرسال الطلب. انتظر موافقة الأدمن لإصدار ID رسمي.";
    if (scName) scName.textContent = name;
    if (scPhone) scPhone.textContent = phoneRaw;
    if (successCard) successCard.style.display = "block";

    form.reset();
  } catch (err) {
    console.error(err);
    showErr(err?.message || "❌ حصل خطأ أثناء الإرسال (راجع Console)");
  } finally {
    setLoadingBtn(false);
  }
});

/** ================== Logout ================== */
btnLogout?.addEventListener("click", async () => {
  await signOut(auth);
  window.location.replace("index.html");
});
