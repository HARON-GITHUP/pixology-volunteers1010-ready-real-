# Pixology Volunteers System — PRO (Ready to Sell)

هذا المشروع عبارة عن نظام كامل لإدارة المتطوعين والمهام والنقاط والشهادات باستخدام **Firebase Auth + Firestore** وواجهة Frontend على GitHub Pages.

## الأدوار Roles
- **admin / superadmin**: إدارة الطلبات، قبول/رفض، إنشاء وتوجيه المهام، متابعة النقاط، عرض اللوحات.
- **volunteer**: بعد الموافقة فقط. يقدر يشوف المهام الموجهة له، يقبلها، ويسلّمها.
- **org**: حساب مؤسسة (Active مباشرة – يمكن تغييره حسب احتياجك).

## Workflow (من أول تسجيل لحد المهام)
1) المستخدم يسجل دخول بجوجل من الصفحة الرئيسية.
2) إذا اختار **متطوع** → يتم إنشاء user كـ **Pending (active=false)** ويتم تحويله لصفحة **تقديم طلب التطوع**.
3) الأدمن يفتح **admin.html**:
   - يراجع الطلبات Pending
   - **Approve**: ينقل المستخدم لمتطوع معتمد ويقدر يستقبل مهام
   - **Reject**: يرفض الطلب
4) الأدمن يقدر يضغط **Assign Task** لإرسال مهمة لمتطوع محدد (Targeted Task).
5) المتطوع يفتح **tasks.html** ويقبل المهمة (Accepted) ثم يسلمها (Completed).

## Security (مهم جدًا للبيع)
- تطبيق Firestore Rules النهائية من الملف:
  **FIRESTORE_RULES_PROD.rules**
- ممنوع على المتطوع تعديل:
  - assignedTo / points / durationHours / createdBy
- مسموح فقط بتغيير status ضمن مسار محدد (pending → accepted → completed).

## ملفات مهمة
- `index.html` + `index.js` : الصفحة الرئيسية + Start Gate
- `register.html` + `register.js` : تقديم طلب تطوع
- `admin.html` + `admin.js` : لوحة الأدمن
- `tasks.html` + `tasks.js` : مهام المتطوع
- `ui.js` : Toast + Loading + escapeHTML + safeUrl
- `sw.js` : PWA Service Worker (Network-first)

## Deployment
- ارفع المشروع على GitHub Pages (branch: main / folder root)
- في Firebase Console:
  1) Authentication → فعّل Google
  2) Firestore → Paste rules من `FIRESTORE_RULES_PROD.rules`
  3) أضف دومين GitHub Pages في Authorized domains

## Debug
لو ظهرت شاشة بيضا:
- افتح الصفحة بإضافة `?debug=1`
مثال: `index.html?debug=1`
