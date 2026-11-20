import { initializeApp } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js";
import {
  getDatabase,
  onValue,
  push,
  ref,
  remove,
  runTransaction,
  set,
  update
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyAEtC9-viSF3yFXgMaXqW6ZROF0RAvjXw",
  authDomain: "el-joker-barbershop.firebaseapp.com",
  databaseURL: "https://el-joker-barbershop-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "el-joker-barbershop",
  storageBucket: "el-joker-barbershop.firebasestorage.app",
  messagingSenderId: "352454886976",
  appId: "1:352454886976:web:d54782baeb244e8e1201a5"
};
const firebaseApp = initializeApp(firebaseConfig);
const database = getDatabase(firebaseApp);
const shopRef = ref(database, "jokerShop");

(() => {
  "use strict";

  const STORAGE_KEY = "elJokerBarbershop.v1";
  const CUSTOMER_BOOKING_KEY = "elJoker.customerBookingId";
  const services = [
    { id: "hair", name: "حلاقة شعر", price: 100, duration: 30, icon: "✂️" },
    { id: "beard", name: "تحديد وتهذيب لحية (دقن)", price: 50, duration: 15, icon: "🪒" },
    { id: "combo", name: "حلاقة شعر + لحية (باقة الجوكر)", price: 140, duration: 45, icon: "💈" },
    { id: "skin", name: "تنظيف بشرة وماسك بخار", price: 80, duration: 20, icon: "🧖" },
    { id: "dye", name: "صبغة شعر أو لحية", price: 120, duration: 30, icon: "🎨" },
    { id: "style", name: "استشوار وتصفيف", price: 40, duration: 15, icon: "💨" }
  ];
  const $ = (selector) => document.querySelector(selector);
  const els = {
    statusCard: $(".status-card"), statusTitle: $("#status-title"), statusMessage: $("#status-message"),
    statusDot: $("#status-dot"), hours: $("#hours-display"), breakTime: $("#break-display"),
    customerView: $("#customer-view"), adminView: $("#admin-view"), roleButton: $("#role-button"),
    viewLabel: $("#view-label"), services: $("#services-list"), totalDuration: $("#total-duration"),
    totalPrice: $("#total-price"), slots: $("#slots-list"), slotsHelp: $("#slots-help"),
    bookingForm: $("#booking-form"), selectedTime: $("#selected-time"), bookingError: $("#booking-error"),
    bookingClosed: $("#booking-closed"), ticket: $("#booking-ticket"), queue: $("#public-queue"),
    adminQueue: $("#admin-queue"), toast: $("#toast"), reportRows: $("#report-rows")
  };
  let state = loadState();
  let selectedServices = new Set();
  let selectedSlot = null;
  let isAdmin = false;
  let cloudReady = false;
  let cloudSeedStarted = false;
  let pinCleanupStarted = false;
  let toastTimer;

  function localDate(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  function addDays(date, amount) {
    const result = new Date(date);
    result.setDate(result.getDate() + amount);
    return localDate(result);
  }
  function timeToMinutes(value) {
    const [hours, minutes] = value.split(":").map(Number);
    return hours * 60 + minutes;
  }
  function minutesToTime(minutes) {
    const normalized = ((minutes % 1440) + 1440) % 1440;
    return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
  }
  function formatTime(value) {
    const [hour, minute] = value.split(":").map(Number);
    const suffix = hour < 12 ? "ص" : "م";
    const display = hour % 12 || 12;
    return `${display}:${String(minute).padStart(2, "0")} ${suffix}`;
  }
  function formatDate(date) {
    return new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${date}T12:00:00`));
  }
  function money(amount) {
    return new Intl.NumberFormat("ar-EG").format(amount);
  }
  function escapeHtml(value = "") {
    return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  }
  function defaultState() {
    const today = localDate();
    const yesterday = addDays(new Date(), -1);
    const week = addDays(new Date(), -4);
    const now = new Date();
    const completedTime = Math.max(9 * 60, Math.min(timeToMinutes("09:00"), now.getHours() * 60 + now.getMinutes() - 70));
    const pastBooking = (id, name, phone, date, time, serviceIds, status = "completed") => {
      const selected = serviceIds.map((serviceId) => services.find((service) => service.id === serviceId));
      return {
        id, name, phone, date, time,
        serviceIds,
        services: selected.map((service) => service.name),
        duration: selected.reduce((sum, service) => sum + service.duration, 0),
        price: selected.reduce((sum, service) => sum + service.price, 0),
        status, createdAt: new Date().toISOString()
      };
    };
    return {
      settings: { status: "open", reason: "", open: "06:00", close: "13:00", breakStart: "13:00", breakEnd: "13:00", pin: "1234" },
      bookings: [
        pastBooking("demo-today-1", "محمود علي", "01012345678", today, minutesToTime(completedTime), ["hair"]),
        pastBooking("demo-today-2", "كريم حسن", "01123456789", today, minutesToTime(completedTime + 40), ["beard", "style"]),
        pastBooking("demo-yesterday-1", "عمر سمير", "01234567890", yesterday, "12:30", ["combo"]),
        pastBooking("demo-yesterday-2", "حسام إبراهيم", "01098765432", yesterday, "17:00", ["hair", "skin"]),
        pastBooking("demo-week-1", "أحمد فوزي", "01512345678", week, "11:15", ["hair", "beard"]),
        pastBooking("demo-week-2", "يوسف عادل", "01045678912", week, "18:00", ["dye", "style"]),
        pastBooking("demo-queue-1", "محمد سامح", "01145678912", today, "11:00", ["hair"], "confirmed"),
        pastBooking("demo-queue-2", "علي مصطفى", "01278945612", today, "12:00", ["combo"], "confirmed")
      ],
      reviews: [
        { id: "review-1", name: "محمود", rating: 5, comment: "شغل ممتاز وتعامل محترم، هرجع تاني أكيد.", date: yesterday },
        { id: "review-2", name: "كريم", rating: 5, comment: "أحسن حلاقة جربتها، المكان نضيف جداً.", date: addDays(new Date(), -3) },
        { id: "review-3", name: "عمر", rating: 4, comment: "خدمة سريعة واهتمام بالتفاصيل.", date: addDays(new Date(), -6) }
      ]
    };
  }
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        const fresh = defaultState();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
        return fresh;
      }
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.settings || !Array.isArray(parsed.bookings) || !Array.isArray(parsed.reviews)) throw new Error("تخزين محلي غير صالح");
      if (parsed.settings.open === "09:00" && parsed.settings.close === "00:00" && parsed.settings.breakStart === "15:00" && parsed.settings.breakEnd === "16:00") {
        parsed.settings.open = "06:00";
        parsed.settings.close = "13:00";
        parsed.settings.breakStart = "13:00";
        parsed.settings.breakEnd = "13:00";
        for (const booking of parsed.bookings) {
          if (booking.id === "demo-queue-1") booking.time = "11:00";
          if (booking.id === "demo-queue-2") booking.time = "12:00";
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
      }
      return parsed;
    } catch (error) {
      console.error("تعذر قراءة بيانات الصالون المحفوظة:", error);
      const fresh = defaultState();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
      return fresh;
    }
  }
  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error("تعذر حفظ بيانات الصالون:", error);
      showToast("تعذر حفظ البيانات على هذا الجهاز. تحقق من مساحة التخزين.");
      throw error;
    }
  }
  function toCloudState() {
    const bookings = Object.fromEntries(state.bookings.map((booking) => [booking.id, booking]));
    const reviews = Object.fromEntries(state.reviews.map((review) => [review.id, review]));
    const publicSettings = { ...state.settings };
    // Keep the client-side PIN out of the database; it is not an authentication credential.
    delete publicSettings.pin;
    const bookingLocks = {};
    for (const booking of state.bookings) {
      if (booking.date !== localDate() || (booking.status !== "confirmed" && booking.status !== "in_progress")) continue;
      const locks = bookingLocks[booking.date] || (bookingLocks[booking.date] = {});
      for (let minute = timeToMinutes(booking.time); minute < timeToMinutes(booking.time) + booking.duration; minute += 1) {
        locks[String(minute)] = booking.id;
      }
    }
    return { settings: publicSettings, bookings, reviews, bookingLocks };
  }
  function reportCloudError(error, message = "تعذر الاتصال بقاعدة البيانات. تحقق من اتصال الإنترنت وقواعد Firebase.") {
    console.error("Firebase Realtime Database error:", error);
    cloudReady = false;
    $("#sync-status").textContent = "غير متصل";
    $("#sync-status").className = "sync-status disconnected";
    showToast(message);
  }
  function connectRealtimeDatabase() {
    onValue(shopRef, (snapshot) => {
      if (!snapshot.exists()) {
        if (cloudSeedStarted) return;
        cloudSeedStarted = true;
        set(shopRef, toCloudState()).catch((error) => reportCloudError(error, "تعذر تهيئة قاعدة البيانات. راجع قواعد Firebase."));
        return;
      }
      const cloudState = snapshot.val();
      if (!cloudState.settings) {
        if (!Object.keys(cloudState).length && !cloudSeedStarted) {
          cloudSeedStarted = true;
          set(shopRef, toCloudState()).catch((error) => reportCloudError(error, "تعذر تهيئة قاعدة البيانات. راجع قواعد Firebase."));
          return;
        }
        reportCloudError(new Error("بيانات jokerShop لا تحتوي على الإعدادات المطلوبة."), "بيانات قاعدة Firebase غير مكتملة.");
        return;
      }
      if (Object.hasOwn(cloudState.settings, "pin") && !pinCleanupStarted) {
        pinCleanupStarted = true;
        remove(ref(database, "jokerShop/settings/pin")).catch((error) => {
          console.error("تعذر حذف رمز PIN المكشوف من قاعدة البيانات:", error);
          showToast("تعذر حذف PIN قديم من قاعدة Firebase. غيّره بعد ضبط صلاحيات القاعدة.");
        });
      }
      const cloudSettings = { ...cloudState.settings };
      delete cloudSettings.pin;
      state = {
        settings: { ...state.settings, ...cloudSettings },
        bookings: Object.values(cloudState.bookings || {}),
        reviews: Object.values(cloudState.reviews || {})
      };
      cloudReady = true;
      $("#sync-status").textContent = "متصل مباشر";
      $("#sync-status").className = "sync-status connected";
      saveState();
      renderAll();
    }, (error) => reportCloudError(error));
  }
  function requireCloud() {
    if (cloudReady) return true;
    showToast("انتظر اتصال التطبيق بقاعدة البيانات قبل تنفيذ العملية.");
    return false;
  }
  function lockMinutes(booking) {
    const start = timeToMinutes(booking.time);
    return Array.from({ length: booking.duration }, (_, index) => String(start + index));
  }
  async function reserveBookingSlot(booking) {
    const locksRef = ref(database, `jokerShop/bookingLocks/${booking.date}`);
    const minutes = lockMinutes(booking);
    const result = await runTransaction(locksRef, (currentLocks) => {
      const locks = currentLocks && typeof currentLocks === "object" ? { ...currentLocks } : {};
      if (minutes.some((minute) => locks[minute])) return;
      for (const minute of minutes) locks[minute] = booking.id;
      return locks;
    }, { applyLocally: false });
    if (!result.committed) throw new Error("تم حجز هذا الموعد للتو. اختر موعداً آخر.");
  }
  async function releaseBookingSlot(booking) {
    const locksRef = ref(database, `jokerShop/bookingLocks/${booking.date}`);
    const minutes = lockMinutes(booking);
    await runTransaction(locksRef, (currentLocks) => {
      if (!currentLocks || typeof currentLocks !== "object") return currentLocks;
      const locks = { ...currentLocks };
      for (const minute of minutes) {
        if (locks[minute] === booking.id) delete locks[minute];
      }
      return Object.keys(locks).length ? locks : null;
    }, { applyLocally: false });
  }
  function activeBookings() {
    return state.bookings.filter((booking) => booking.status === "confirmed" || booking.status === "in_progress");
  }
  function selectedTotals() {
    const chosen = services.filter((service) => selectedServices.has(service.id));
    return { duration: chosen.reduce((total, service) => total + service.duration, 0), price: chosen.reduce((total, service) => total + service.price, 0), chosen };
  }
  function shopStatus() {
    if (state.settings.status === "emergency") return "emergency";
    if (state.settings.status === "holiday") return "holiday";
    const now = new Date();
    const current = now.getHours() * 60 + now.getMinutes();
    const opening = timeToMinutes(state.settings.open);
    let closing = timeToMinutes(state.settings.close);
    if (closing <= opening) closing += 1440;
    const breakStart = timeToMinutes(state.settings.breakStart);
    let breakEnd = timeToMinutes(state.settings.breakEnd);
    if (breakEnd <= breakStart && breakEnd !== breakStart) breakEnd += 1440;
    if (breakStart !== breakEnd && current >= breakStart && current < breakEnd) return "break";
    if (current < opening || current >= closing) return "off-hours";
    return "open";
  }
  function renderStatus() {
    const status = shopStatus();
    const messages = {
      open: ["مفتوح ومتاح للحجز", "أهلاً بيك! اختار الخدمة والموعد المناسب."],
      emergency: ["مغلق مؤقتاً - ظرف طارئ", state.settings.reason || "نعتذر عن استقبال الحجوزات حالياً بسبب ظرف طارئ."],
      holiday: ["مغلق - إجازة رسمية", "نعتذر، الصالون في إجازة رسمية حالياً."],
      break: ["فترة راحة حالياً", `سنعود لاستقبالكم بعد ${formatTime(state.settings.breakEnd)}.`],
      "off-hours": ["مغلق حالياً", `مواعيدنا من ${formatTime(state.settings.open)} إلى ${formatTime(state.settings.close)}. نتشرف بزيارتك خلال ساعات العمل.`]
    };
    const [title, message] = messages[status];
    els.statusTitle.textContent = title;
    els.statusMessage.textContent = message;
    els.statusCard.classList.toggle("status-closed", status !== "open" && status !== "break");
    els.statusCard.classList.toggle("status-holiday", status === "holiday");
    els.hours.textContent = `${formatTime(state.settings.open)} – ${formatTime(state.settings.close)}`;
    els.breakTime.textContent = state.settings.breakStart === state.settings.breakEnd ? "لا توجد" : `${formatTime(state.settings.breakStart)} – ${formatTime(state.settings.breakEnd)}`;
    const closed = status !== "open";
    els.bookingClosed.classList.toggle("hidden", !closed);
    els.bookingClosed.textContent = status === "break" ? "الصالون في فترة راحة حالياً. يمكنك اختيار موعد بعد انتهاء الراحة." : message;
    renderSlots();
  }
  function renderServices() {
    els.services.innerHTML = services.map((service) => `
      <label class="service-card" data-service="${service.id}">
        <input type="checkbox" value="${service.id}" aria-label="${escapeHtml(service.name)}">
        <span class="service-icon" aria-hidden="true">${service.icon}</span>
        <span class="service-info"><strong>${escapeHtml(service.name)}</strong><small>${service.duration} دقيقة</small></span>
        <span class="service-price">${money(service.price)} ج.م</span>
      </label>`).join("");
    els.services.addEventListener("change", (event) => {
      const input = event.target.closest("input");
      if (!input) return;
      if (input.checked) selectedServices.add(input.value);
      else selectedServices.delete(input.value);
      input.closest(".service-card").classList.toggle("selected", input.checked);
      selectedSlot = null;
      els.bookingForm.classList.add("hidden");
      renderTotals();
      renderSlots();
    });
  }
  function renderTotals() {
    const totals = selectedTotals();
    els.totalDuration.textContent = money(totals.duration);
    els.totalPrice.textContent = money(totals.price);
  }
  function bookingOverlaps(start, end, booking) {
    const otherStart = timeToMinutes(booking.time);
    const otherEnd = otherStart + booking.duration;
    return start < otherEnd && end > otherStart;
  }
  function isSlotAvailable(time, duration) {
    const start = timeToMinutes(time);
    const end = start + duration;
    const opening = timeToMinutes(state.settings.open);
    let closing = timeToMinutes(state.settings.close);
    if (closing <= opening) closing += 1440;
    if (start < opening || end > closing) return false;
    const breakStart = timeToMinutes(state.settings.breakStart);
    let breakEnd = timeToMinutes(state.settings.breakEnd);
    if (breakEnd <= breakStart && breakEnd !== breakStart) breakEnd += 1440;
    if (breakStart !== breakEnd && start < breakEnd && end > breakStart) return false;
    const now = new Date();
    if (start <= now.getHours() * 60 + now.getMinutes() && localDate() === $("#today-label").dataset.date) return false;
    return !activeBookings().some((booking) => booking.date === localDate() && bookingOverlaps(start, end, booking));
  }
  function renderSlots() {
    if (!els.slots) return;
    const totals = selectedTotals();
    const status = shopStatus();
    if (!totals.duration) {
      els.slots.replaceChildren();
      els.slotsHelp.textContent = "اختار خدمة واحدة على الأقل علشان نعرض لك المواعيد المناسبة.";
      return;
    }
    if (status === "emergency" || status === "holiday" || status === "off-hours") {
      els.slots.replaceChildren();
      els.slotsHelp.textContent = "";
      return;
    }
    const opening = timeToMinutes(state.settings.open);
    let closing = timeToMinutes(state.settings.close);
    if (closing <= opening) closing += 1440;
    const available = [];
    for (let minute = opening; minute + totals.duration <= closing; minute += 15) {
      const time = minutesToTime(minute);
      if (isSlotAvailable(time, totals.duration)) available.push(time);
    }
    els.slotsHelp.textContent = available.length ? "كل موعد محسوب على مدة خدماتك، ومش هيتعارض مع الراحة أو حجوزات تانية." : "مفيش مواعيد مناسبة متاحة لباقي اليوم. جرب بعدين أو تواصل مع الصالون.";
    els.slots.innerHTML = available.map((time) => `<button class="slot-button${selectedSlot === time ? " active" : ""}" type="button" data-time="${time}">${formatTime(time)}</button>`).join("");
    els.slots.querySelectorAll(".slot-button").forEach((button) => button.addEventListener("click", () => selectSlot(button.dataset.time)));
    if (selectedSlot && !available.includes(selectedSlot)) {
      selectedSlot = null;
      els.bookingForm.classList.add("hidden");
    }
  }
  function selectSlot(time) {
    selectedSlot = time;
    els.slots.querySelectorAll(".slot-button").forEach((button) => button.classList.toggle("active", button.dataset.time === time));
    els.selectedTime.textContent = formatTime(time);
    els.bookingForm.classList.remove("hidden");
    els.bookingError.classList.add("hidden");
    els.bookingForm.scrollIntoView({ behavior: "smooth", block: "center" });
    $("#customer-name").focus({ preventScroll: true });
  }
  function normalizeDigits(value) {
    return value.replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit))).replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
  }
  function validEgyptianPhone(input) {
    const phone = normalizeDigits(input).replace(/[\s()-]/g, "");
    return /^(?:\+?20|0020)?1[0125]\d{8}$/.test(phone) || /^0?1[0125]\d{8}$/.test(phone);
  }
  function normalizeEgyptianPhone(input) {
    let phone = normalizeDigits(input).replace(/\D/g, "");
    if (phone.startsWith("0020")) phone = phone.slice(2);
    if (phone.startsWith("20") && phone.length === 12) phone = `0${phone.slice(2)}`;
    if (phone.length === 10 && phone.startsWith("1")) phone = `0${phone}`;
    return phone;
  }
  async function submitBooking(event) {
    event.preventDefault();
    if (!requireCloud()) return;
    const name = $("#customer-name").value.trim();
    const rawPhone = $("#customer-phone").value.trim();
    const phone = normalizeEgyptianPhone(rawPhone);
    const totals = selectedTotals();
    const status = shopStatus();
    let error = "";
    if (!name) error = "من فضلك اكتب اسمك.";
    else if (!validEgyptianPhone(rawPhone)) error = "اكتب رقم موبايل مصري صحيح (11 رقم ويبدأ بـ 010 أو 011 أو 012 أو 015).";
    else if (!selectedSlot || !totals.duration) error = "اختار الخدمات والموعد المناسب الأول.";
    else if (status !== "open") error = "الحجز غير متاح حالياً. راجع حالة الصالون.";
    else if (!isSlotAvailable(selectedSlot, totals.duration)) error = "الموعد ده مبقاش متاح. اختار موعداً آخر.";
    if (error) {
      els.bookingError.textContent = error;
      els.bookingError.classList.remove("hidden");
      return;
    }
    const newBookingRef = push(ref(database, "jokerShop/bookings"));
    const booking = {
      id: newBookingRef.key, name, phone, date: localDate(), time: selectedSlot,
      serviceIds: totals.chosen.map((service) => service.id),
      services: totals.chosen.map((service) => service.name),
      duration: totals.duration, price: totals.price, status: "confirmed",
      createdAt: new Date().toISOString()
    };
    try {
      await reserveBookingSlot(booking);
      await set(newBookingRef, booking);
    } catch (error) {
      if (error.message !== "تم حجز هذا الموعد للتو. اختر موعداً آخر.") {
        try {
          await releaseBookingSlot(booking);
        } catch (releaseError) {
          console.error("تعذر تحرير قفل الموعد بعد فشل الحجز:", releaseError);
        }
      }
      els.bookingError.textContent = error.message === "تم حجز هذا الموعد للتو. اختر موعداً آخر."
        ? error.message
        : "تعذر حفظ الحجز على Firebase. تحقق من الاتصال وقواعد قاعدة البيانات.";
      els.bookingError.classList.remove("hidden");
      console.error("تعذر إنشاء الحجز على Firebase:", error);
      return;
    }
    state.bookings.push(booking);
    saveState();
    localStorage.setItem(CUSTOMER_BOOKING_KEY, booking.id);
    selectedSlot = null;
    els.bookingForm.classList.add("hidden");
    $("#booking-form").reset();
    renderAll();
    renderTicket();
    showToast("تم تأكيد حجزك بنجاح! مستنيينك يا بطل.");
    $("#booking-ticket").scrollIntoView({ behavior: "smooth", block: "center" });
    requestNotificationPermission();
  }
  function sortedTodayBookings() {
    return activeBookings().filter((booking) => booking.date === localDate()).sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
  }
  function firstName(name) {
    return name.trim().split(/\s+/)[0] || "عميل";
  }
  function renderPublicQueue() {
    const items = sortedTodayBookings();
    els.queue.innerHTML = items.map((booking, index) => {
      const own = booking.id === localStorage.getItem(CUSTOMER_BOOKING_KEY);
      return `<tr><td>${index + 1}</td><td>${escapeHtml(firstName(booking.name))}${own ? ' <span class="status-badge">حجزك</span>' : ""}</td><td>${formatTime(booking.time)}</td><td>${booking.duration} دقيقة</td><td><span class="status-badge">مؤكد</span></td></tr>`;
    }).join("");
    $("#queue-empty").classList.toggle("hidden", items.length > 0);
  }
  function renderTicket() {
    const ownId = localStorage.getItem(CUSTOMER_BOOKING_KEY);
    const booking = state.bookings.find((item) => item.id === ownId);
    if (!booking || booking.status === "cancelled") {
      els.ticket.classList.add("hidden");
      return;
    }
    const position = sortedTodayBookings().findIndex((item) => item.id === booking.id) + 1;
    const minutesUntil = booking.date === localDate() ? timeToMinutes(booking.time) - (new Date().getHours() * 60 + new Date().getMinutes()) : null;
    const remaining = minutesUntil === null ? formatDate(booking.date) : minutesUntil <= 0 ? "موعدك الآن" : `متبقي ${Math.floor(minutesUntil / 60) ? `${Math.floor(minutesUntil / 60)} ساعة و` : ""}${minutesUntil % 60} دقيقة`;
    const label = booking.status === "completed" ? "مكتمل" : booking.status === "cancelled" ? "ملغي" : "مؤكد";
    els.ticket.innerHTML = `<div class="ticket-top"><div><span class="eyebrow">تذكرة حجزك</span><h3>مستنيينك يا ${escapeHtml(firstName(booking.name))}!</h3></div><span class="ticket-number">#${escapeHtml(booking.id)}</span></div>
      <div class="ticket-details"><div><span>موعدك</span><strong>${formatDate(booking.date)}، ${formatTime(booking.time)}</strong></div><div><span>الدور</span><strong>${position || "—"}</strong></div><div><span>الوقت المتبقي</span><strong>${remaining}</strong></div><div><span>الإجمالي</span><strong>${money(booking.price)} ج.م</strong></div></div>
      <div class="ticket-services">${booking.services.map(escapeHtml).join("، ")} · ${booking.duration} دقيقة</div>
      <div class="ticket-actions"><span class="status-badge${booking.status === "completed" ? " complete" : booking.status === "cancelled" ? " cancelled" : ""}">${label}</span>${booking.status === "confirmed" ? '<button class="button button-danger button-small" id="cancel-own-booking" type="button">إلغاء حجزي</button>' : ""}</div>`;
    els.ticket.classList.remove("hidden");
    const cancelButton = $("#cancel-own-booking");
    if (cancelButton) cancelButton.addEventListener("click", cancelOwnBooking);
  }
  async function cancelOwnBooking() {
    if (!requireCloud()) return;
    const booking = state.bookings.find((item) => item.id === localStorage.getItem(CUSTOMER_BOOKING_KEY));
    if (!booking || booking.status !== "confirmed") return;
    if (!window.confirm("هل أنت متأكد من إلغاء حجزك؟")) return;
    const cancelledAt = new Date().toISOString();
    try {
      await update(ref(database, `jokerShop/bookings/${booking.id}`), { status: "cancelled", cancelledAt });
      await releaseBookingSlot(booking);
    } catch (error) {
      reportCloudError(error, "تعذر إلغاء الحجز. حاول مرة أخرى.");
      return;
    }
    booking.status = "cancelled";
    booking.cancelledAt = cancelledAt;
    saveState();
    renderAll();
    showToast("تم إلغاء حجزك وتحرير الموعد.");
  }
  function renderReviews() {
    const list = [...state.reviews].sort((a, b) => b.date.localeCompare(a.date));
    const total = list.reduce((sum, review) => sum + Number(review.rating), 0);
    $("#average-rating").textContent = list.length ? (total / list.length).toFixed(1) : "—";
    $("#rating-count").textContent = `(${money(list.length)} تقييم)`;
    $("#reviews-list").innerHTML = list.map((review) => `<article class="review-card"><div class="review-person"><span>${escapeHtml(review.name)}</span><span class="review-date">${formatDate(review.date)}</span></div><div class="stars" aria-label="${review.rating} من 5">${"★".repeat(review.rating)}${"☆".repeat(5 - review.rating)}</div>${review.comment ? `<p>${escapeHtml(review.comment)}</p>` : ""}</article>`).join("");
  }
  async function submitReview(event) {
    event.preventDefault();
    if (!requireCloud()) return;
    const name = localStorage.getItem(CUSTOMER_BOOKING_KEY) ? (state.bookings.find((item) => item.id === localStorage.getItem(CUSTOMER_BOOKING_KEY)) || {}).name : "";
    const reviewer = name ? firstName(name) : "عميل الجوكر";
    const rating = Number($("#review-rating").value);
    const comment = $("#review-comment").value.trim();
    const newReviewRef = push(ref(database, "jokerShop/reviews"));
    const review = { id: newReviewRef.key, name: reviewer, rating, comment, date: localDate() };
    try {
      await set(newReviewRef, review);
    } catch (error) {
      reportCloudError(error, "تعذر إرسال التقييم. حاول مرة أخرى.");
      return;
    }
    state.reviews.push(review);
    saveState();
    $("#review-form").reset();
    renderReviews();
    showToast("شكراً على تقييمك الجميل!");
  }
  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.add("hidden"), 3800);
  }
  function requestNotificationPermission() {
    if (!("Notification" in window) || Notification.permission !== "default") return;
    Notification.requestPermission().catch((error) => console.warn("إذن إشعارات المتصفح لم يُمنح:", error));
  }
  function checkCustomerAlerts() {
    const booking = state.bookings.find((item) => item.id === localStorage.getItem(CUSTOMER_BOOKING_KEY) && item.status === "confirmed");
    if (!booking || booking.date !== localDate()) return;
    const queue = sortedTodayBookings();
    const index = queue.findIndex((item) => item.id === booking.id);
    const minutesUntil = timeToMinutes(booking.time) - (new Date().getHours() * 60 + new Date().getMinutes());
    const alertKey = `elJoker.alert.${booking.id}`;
    let alert = "";
    if (index >= 0 && index <= 1) alert = "يتبقى عميل واحد فقط أو أقل قبلك. استعد لموعدك!";
    else if (minutesUntil > 0 && minutesUntil <= 30) alert = "يتبقى أقل من 30 دقيقة على موعدك. ننتظرك!";
    if (!alert || sessionStorage.getItem(alertKey) === alert) return;
    sessionStorage.setItem(alertKey, alert);
    showToast(alert);
    if ("Notification" in window && Notification.permission === "granted") new Notification("صالون الجوكر", { body: alert });
  }
  function setAdminMode(value) {
    isAdmin = value;
    els.customerView.classList.toggle("hidden", isAdmin);
    els.adminView.classList.toggle("hidden", !isAdmin);
    els.viewLabel.textContent = isAdmin ? "وضع الحلاق" : "وضع العميل";
    els.roleButton.textContent = isAdmin ? "معاينة كعميل / تسجيل خروج" : "دخول الحلاق / الإدارة";
    if (isAdmin) renderAdmin();
    else renderAll();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function statusLabel(status) {
    return status === "confirmed" ? "مؤكد" : status === "in_progress" ? "جارٍ التنفيذ" : status === "completed" ? "مكتمل" : "ملغي";
  }
  function renderAdminQueue() {
    const list = [...state.bookings].filter((booking) => booking.date === localDate()).sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
    els.adminQueue.innerHTML = list.map((booking) => {
      const actions = booking.status === "confirmed" || booking.status === "in_progress"
        ? `<button class="button button-success button-small" data-action="complete" data-id="${escapeHtml(booking.id)}" type="button">تم الانتهاء</button><button class="button button-danger button-small" data-action="cancel" data-id="${escapeHtml(booking.id)}" type="button">إلغاء</button>`
        : "";
      const phone = normalizeEgyptianPhone(booking.phone);
      return `<tr><td><strong>${escapeHtml(booking.name)}</strong><div class="contact-links"><a href="tel:${escapeHtml(phone)}">اتصال</a><a href="https://wa.me/2${escapeHtml(phone.replace(/^0/, ""))}" target="_blank" rel="noopener">واتساب</a></div></td><td>${booking.services.map(escapeHtml).join("، ")}</td><td>${booking.duration} دقيقة</td><td>${money(booking.price)} ج.م</td><td>${formatTime(booking.time)}</td><td><span class="status-badge ${booking.status === "completed" ? "complete" : booking.status === "cancelled" ? "cancelled" : ""}">${statusLabel(booking.status)}</span><div class="contact-links">${actions}</div></td></tr>`;
    }).join("");
    $("#admin-queue-empty").classList.toggle("hidden", list.length > 0);
    els.adminQueue.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", () => manageBooking(button.dataset.id, button.dataset.action)));
  }
  async function manageBooking(id, action) {
    if (!requireCloud()) return;
    const booking = state.bookings.find((item) => item.id === id);
    if (!booking || booking.status !== "confirmed") return;
    const updatedAt = new Date().toISOString();
    const changes = action === "cancel"
      ? { status: "cancelled", cancelledAt: updatedAt }
      : { status: "completed", completedAt: updatedAt };
    if (action === "cancel") {
      if (!window.confirm(`إلغاء حجز ${booking.name}؟`)) return;
    }
    try {
      await update(ref(database, `jokerShop/bookings/${booking.id}`), changes);
      await releaseBookingSlot(booking);
    } catch (error) {
      reportCloudError(error, "تعذر تحديث الحجز. حاول مرة أخرى.");
      return;
    }
    Object.assign(booking, changes);
    if (action !== "cancel") showToast("تم تسجيل انتهاء الخدمة وإضافة المبلغ إلى الإيرادات.");
    saveState();
    renderAll();
    if (isAdmin) renderAdmin();
    checkCustomerAlerts();
  }
  function populateSettings() {
    $("#open-time").value = state.settings.open;
    $("#close-time").value = state.settings.close;
    $("#break-start").value = state.settings.breakStart;
    $("#break-end").value = state.settings.breakEnd;
    $("#new-pin").value = "";
    $("#emergency-reason-input").value = state.settings.reason;
    $("#reason-wrap").classList.toggle("hidden", state.settings.status !== "emergency");
  }
  async function saveSettings(event) {
    event.preventDefault();
    if (!requireCloud()) return;
    const opening = $("#open-time").value;
    const closing = $("#close-time").value;
    const breakStart = $("#break-start").value;
    const breakEnd = $("#break-end").value;
    const pin = $("#new-pin").value.trim();
    const errorEl = $("#settings-error");
    let openingMinutes = timeToMinutes(opening);
    let closingMinutes = timeToMinutes(closing);
    if (closingMinutes <= openingMinutes) closingMinutes += 1440;
    if (closingMinutes - openingMinutes > 24 * 60) {
      errorEl.textContent = "مدة العمل يجب أن تكون أقل من 24 ساعة.";
      errorEl.classList.remove("hidden");
      return;
    }
    if ((breakStart === "") !== (breakEnd === "")) {
      errorEl.textContent = "أدخل وقت بداية ونهاية الراحة معاً.";
      errorEl.classList.remove("hidden");
      return;
    }
    if (breakStart !== breakEnd) {
      const start = timeToMinutes(breakStart);
      let end = timeToMinutes(breakEnd);
      if (end <= start) end += 1440;
      if (start < openingMinutes || end > closingMinutes) {
        errorEl.textContent = "فترة الراحة يجب أن تكون داخل مواعيد العمل.";
        errorEl.classList.remove("hidden");
        return;
      }
    }
    if (pin && !/^\d{4,8}$/.test(pin)) {
      errorEl.textContent = "رمز PIN يجب أن يتكون من 4 إلى 8 أرقام.";
      errorEl.classList.remove("hidden");
      return;
    }
    const changes = {
      open: opening,
      close: closing,
      breakStart: breakStart || opening,
      breakEnd: breakEnd || opening
    };
    try {
      await update(ref(database, "jokerShop/settings"), changes);
    } catch (error) {
      errorEl.textContent = "تعذر حفظ الإعدادات على Firebase. تحقق من الاتصال وقواعد قاعدة البيانات.";
      errorEl.classList.remove("hidden");
      console.error("تعذر حفظ إعدادات الصالون على Firebase:", error);
      return;
    }
    Object.assign(state.settings, changes);
    if (pin) state.settings.pin = pin;
    saveState();
    errorEl.classList.add("hidden");
    renderAll();
    renderAdmin();
    showToast("تم حفظ الإعدادات بنجاح.");
  }
  function dateRange(filter) {
    const today = localDate();
    if (filter === "today") return [today, today];
    if (filter === "yesterday") {
      const yesterday = addDays(new Date(), -1);
      return [yesterday, yesterday];
    }
    if (filter === "week") return [addDays(new Date(), -6), today];
    if (filter === "month") return [`${today.slice(0, 7)}-01`, today];
    return [$("#date-from").value || today, $("#date-to").value || today];
  }
  function renderReport() {
    const filter = $("#report-filter").value;
    $("#date-range").classList.toggle("hidden", filter !== "custom");
    const [from, to] = dateRange(filter);
    const completed = state.bookings.filter((booking) => booking.status === "completed" && booking.date >= from && booking.date <= to).sort((a, b) => b.date.localeCompare(a.date) || timeToMinutes(b.time) - timeToMinutes(a.time));
    $("#report-count").textContent = money(completed.length);
    $("#report-revenue").textContent = money(completed.reduce((sum, booking) => sum + booking.price, 0));
    els.reportRows.innerHTML = completed.map((booking) => `<tr><td>${formatDate(booking.date)}</td><td>${escapeHtml(booking.name)}</td><td dir="ltr">${escapeHtml(booking.phone)}</td><td>${booking.services.map(escapeHtml).join("، ")}</td><td>${money(booking.price)} ج.م</td></tr>`).join("");
    $("#report-empty").classList.toggle("hidden", completed.length > 0);
  }
  function renderAdmin() {
    populateSettings();
    renderAdminQueue();
    renderReport();
  }
  function renderAll() {
    renderStatus();
    renderTotals();
    renderPublicQueue();
    renderTicket();
    renderReviews();
    if (isAdmin) renderAdmin();
  }
  function bindEvents() {
    $("#today-label").textContent = formatDate(localDate());
    $("#today-label").dataset.date = localDate();
    $("#year").textContent = String(new Date().getFullYear());
    els.roleButton.addEventListener("click", () => {
      if (isAdmin) setAdminMode(false);
      else {
        $("#pin-input").value = "";
        $("#pin-error").classList.add("hidden");
        $("#pin-modal").classList.remove("hidden");
        $("#pin-input").focus();
      }
    });
    $("#pin-close").addEventListener("click", () => $("#pin-modal").classList.add("hidden"));
    $("#pin-modal").addEventListener("click", (event) => { if (event.target === $("#pin-modal")) $("#pin-modal").classList.add("hidden"); });
    $("#pin-form").addEventListener("submit", (event) => {
      event.preventDefault();
      if ($("#pin-input").value === state.settings.pin) {
        $("#pin-modal").classList.add("hidden");
        setAdminMode(true);
      } else {
        $("#pin-error").textContent = "رمز PIN غير صحيح. حاول مرة أخرى.";
        $("#pin-error").classList.remove("hidden");
      }
    });
    $("#preview-customer").addEventListener("click", () => setAdminMode(false));
    $("#find-slots").addEventListener("click", () => {
      if (!selectedTotals().duration) showToast("اختار خدمة واحدة على الأقل الأول.");
      $("#booking-section").scrollIntoView({ behavior: "smooth" });
    });
    $("#booking-form").addEventListener("submit", submitBooking);
    $("#review-form").addEventListener("submit", submitReview);
    $("#settings-form").addEventListener("submit", saveSettings);
    $("#open-shop").addEventListener("click", () => changeShopStatus("open"));
    $("#holiday-close").addEventListener("click", () => changeShopStatus("holiday"));
    $("#emergency-close").addEventListener("click", () => {
      const wrap = $("#reason-wrap");
      if (wrap.classList.contains("hidden")) {
        wrap.classList.remove("hidden");
        $("#emergency-reason-input").focus();
      } else changeShopStatus("emergency", $("#emergency-reason-input").value.trim());
    });
    $("#report-filter").addEventListener("change", renderReport);
    $("#date-from").addEventListener("change", renderReport);
    $("#date-to").addEventListener("change", renderReport);
    $("#print-report").addEventListener("click", () => window.print());
    $("#qr-open").addEventListener("click", openQrModal);
    $("#qr-close").addEventListener("click", () => $("#qr-modal").classList.add("hidden"));
    $("#qr-modal").addEventListener("click", (event) => { if (event.target === $("#qr-modal")) $("#qr-modal").classList.add("hidden"); });
    $("#copy-url").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(location.href);
        showToast("تم نسخ الرابط.");
      } catch (error) {
        console.warn("تعذر النسخ عبر الحافظة:", error);
        showToast("انسخ الرابط يدوياً من النافذة.");
      }
    });
  }
  async function changeShopStatus(status, reason = "") {
    if (!requireCloud()) return;
    const changes = { status, reason };
    try {
      await update(ref(database, "jokerShop/settings"), changes);
    } catch (error) {
      reportCloudError(error, "تعذر تحديث حالة المحل. حاول مرة أخرى.");
      return;
    }
    Object.assign(state.settings, changes);
    saveState();
    renderAll();
    renderAdmin();
    showToast(status === "open" ? "المحل مفتوح الآن ويستقبل الحجوزات." : "تم تحديث حالة المحل.");
  }
  function openQrModal() {
    const url = location.href;
    $("#page-url").textContent = url;
    $("#qr-image").src = `https://api.qrserver.com/v1/create-qr-code/?size=190x190&data=${encodeURIComponent(url)}`;
    $("#qr-modal").classList.remove("hidden");
  }

  renderServices();
  bindEvents();
  renderAll();
  connectRealtimeDatabase();
  checkCustomerAlerts();
  setInterval(() => {
    renderStatus();
    renderPublicQueue();
    renderTicket();
    if (isAdmin) renderAdminQueue();
    checkCustomerAlerts();
  }, 30000);
})();
