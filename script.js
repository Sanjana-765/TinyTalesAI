const drawingInput = document.querySelector("#drawingInput");
const dropZone = document.querySelector(".drop-zone");
const fileName = document.querySelector("#fileName");
const createStory = document.querySelector("#createStory");
const ageRange = document.querySelector("#ageRange");
const ageToggle = document.querySelector("#ageToggle");
const ageValue = document.querySelector("#ageValue");
const ageOptions = document.querySelector("#ageOptions");
const drawingPreview = document.querySelector("#drawingPreview");
const storyTitle = document.querySelector("#storyTitle");
const storyBody = document.querySelector("#storyBody");
const storyMoral = document.querySelector("#storyMoral");
const objectConfirmation = document.querySelector("#objectConfirmation");
const analysisMessage = document.querySelector("#analysisMessage");
const objectInput = document.querySelector("#objectInput");
const confirmObject = document.querySelector("#confirmObject");
const confirmNote = document.querySelector("#confirmNote");
const uploadIcon = document.querySelector(".upload-icon");
const loadingOverlay = document.querySelector("#loadingOverlay");
const storyActions = document.querySelector("#storyActions");
const readStory = document.querySelector("#readStory");
const printStory = document.querySelector("#printStory");
const downloadPdf = document.querySelector("#downloadPdf");
const saveStory = document.querySelector("#saveStory");
const savedStoriesGrid = document.querySelector("#savedStoriesGrid");
const savedEmpty = document.querySelector("#savedEmpty");
const bedtimeToggle = document.querySelector("#bedtimeToggle");
const getStartedBtn = document.querySelector("#getStartedBtn");
const createSection = document.querySelector("#createSection");
const loginGate = document.querySelector("#loginGate");
const loginForm = document.querySelector("#loginForm");
const loginEmail = document.querySelector("#loginEmail");
const loginPassword = document.querySelector("#loginPassword");
const createAccountBtn = document.querySelector("#createAccountBtn");
const signInBtn = document.querySelector("#signInBtn");
const accountActions = document.querySelector("#accountActions");
const signOutBtn = document.querySelector("#signOutBtn");
const deleteAccountBtn = document.querySelector("#deleteAccountBtn");
const errorPopup = document.querySelector("#errorPopup");
const errorPopupMessage = document.querySelector("#errorPopupMessage");
const errorPopupClose = document.querySelector("#errorPopupClose");
const API_BASE = window.location.protocol === "file:" ? "http://localhost:3000" : "";

// â”€â”€ State â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let uploadedFileName = "";
let uploadedBase64 = "";      // base64-encoded image data (no prefix)
let uploadedMediaType = "";   // e.g. "image/png"
let uploadedImageDataURL = "";
let authToken = "";
let storyCount = 0;

// for story count
const BEDTIME_MODE_KEY = "tinytales_bedtime_mode_v1";
const AUTH_TOKEN_KEY = "tinytales_auth_token_v1";

const AGE_STORY_SETTINGS = {
  "3-5": {
    sentenceRule: "Be 3-5 short sentences long",
    guidance: "Use very simple words, gentle repetition, and one clear moment of kindness."
  },
  "6-8": {
    sentenceRule: "Be 5-7 sentences long",
    guidance: "Use simple storybook language, a small problem, and a clear warm ending."
  },
  "9-12": {
    sentenceRule: "Be 7-9 sentences long",
    guidance: "Use richer details, a stronger character choice, and a thoughtful but still child-friendly moral."
  }
};

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function setBusy(isBusy) {
  document.body.classList.toggle("is-busy", isBusy);
}

function setGenerating(isGenerating) {
  setBusy(isGenerating);
  if (loadingOverlay) loadingOverlay.hidden = !isGenerating;
  createStory.disabled = isGenerating;
  createStory.innerHTML = isGenerating
    ? "Creating..."
    : '<span class="button-spark" aria-hidden="true"></span>Create Story';
}

function normalizeObject(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ");
}

function getSelectedAgeSettings() {
  const selectedAge = ageRange?.value || "6-8";
  return {
    age: selectedAge,
    ...AGE_STORY_SETTINGS[selectedAge]
  };
}

function setAgeDropdownOpen(isOpen) {
  if (!ageOptions || !ageToggle) return;
  ageOptions.hidden = !isOpen;
  ageToggle.setAttribute("aria-expanded", String(isOpen));
}

async function apiFetch(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch {
    throw new Error("Could not connect to server. Start backend and open http://localhost:3000");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }
  return data;
}

function currentStoryText() {
  return `${storyBody.textContent}\n${storyMoral.textContent}`.trim();
}

function currentDrawingImage() {
  if (uploadedImageDataURL) return uploadedImageDataURL;
  const bg = drawingPreview.style.backgroundImage || "";
  const matched = bg.match(/url\(["']?(.*?)["']?\)/i);
  if (matched?.[1]) return matched[1];
  return "assets/storybook-magic.png";
}

function getCurrentStoryPayload() {
  return {
    id: Date.now().toString(),
    image: currentDrawingImage(),
    title: storyTitle.textContent.trim(),
    text: currentStoryText()
  };
}

function isStoryAlreadySaved(story, stories = []) {
  return stories.some((item) => item.title === story.title && item.text === story.text);
}

async function updateSaveButtonState() {
  if (!saveStory) return;
  if (!authToken) {
    saveStory.classList.remove("is-saved");
    saveStory.innerHTML = '<span class="heart-icon" aria-hidden="true"></span>Save Story';
    return;
  }
  const payload = getCurrentStoryPayload();
  const data = await apiFetch("/api/stories");
  const alreadySaved = isStoryAlreadySaved(payload, data.stories || []);
  saveStory.classList.toggle("is-saved", alreadySaved);
  saveStory.innerHTML = alreadySaved
    ? '<span class="heart-icon" aria-hidden="true"></span>Saved'
    : '<span class="heart-icon" aria-hidden="true"></span>Save Story';
}

async function renderSavedStories() {
  if (!savedStoriesGrid || !savedEmpty) return;
  if (!authToken) {
    savedStoriesGrid.innerHTML = "";
    savedEmpty.hidden = false;
    return;
  }
  const data = await apiFetch("/api/stories");
  const stories = data.stories || [];
  savedEmpty.hidden = stories.length > 0;
  savedStoriesGrid.innerHTML = "";

  stories.forEach((story) => {
    const card = document.createElement("article");
    card.className = "saved-story-card";

    const image = document.createElement("img");
    image.className = "saved-story-image";
    image.src = story.image;
    image.alt = `Saved drawing for ${story.title}`;

    const content = document.createElement("div");
    content.className = "saved-story-content";

    const title = document.createElement("h3");
    title.textContent = story.title;

    const text = document.createElement("p");
    text.textContent = story.text;
    text.style.whiteSpace = "pre-line";

    const removeButton = document.createElement("button");
    removeButton.className = "delete-story";
    removeButton.type = "button";
    removeButton.dataset.deleteId = story.id;
    removeButton.textContent = "Delete";

    content.appendChild(title);
    content.appendChild(text);
    content.appendChild(removeButton);
    card.appendChild(image);
    card.appendChild(content);
    savedStoriesGrid.appendChild(card);
  });
}

function setBedtimeMode(enabled) {
  document.body.classList.toggle("bedtime-mode", enabled);
  bedtimeToggle?.setAttribute("aria-pressed", String(enabled));
  localStorage.setItem(BEDTIME_MODE_KEY, enabled ? "1" : "0");
}

function openCreateSection() {
  if (!createSection) return;
  createSection.hidden = false;
  createSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

function setLoginState(isLoggedIn) {
  document.body.classList.toggle("logged-in", isLoggedIn);
  document.body.classList.toggle("logged-out", !isLoggedIn);
  if (loginGate) loginGate.hidden = isLoggedIn;
  if (accountActions) accountActions.hidden = !isLoggedIn;
  if (!isLoggedIn) {
    loginForm?.reset();
    createSection && (createSection.hidden = true);
    storyActions && (storyActions.hidden = true);
  }
}

function showErrorPopup(message) {
  if (!errorPopup || !errorPopupMessage) return;
  errorPopupMessage.textContent = message;
  errorPopup.hidden = false;
}

function hideErrorPopup() {
  if (!errorPopup) return;
  errorPopup.hidden = true;
}

async function imageToDataURL(imageSource) {
  if (!imageSource) return null;
  if (imageSource.startsWith("data:")) return imageSource;

  const response = await fetch(imageSource);
  if (!response.ok) return null;
  const blob = await response.blob();

  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function pdfPalette() {
  if (document.body.classList.contains("bedtime-mode")) {
    return {
      bg: [17, 24, 37],
      card: [31, 41, 60],
      accent: [255, 215, 157],
      heading: [252, 236, 210],
      text: [236, 220, 198],
      chip: [44, 62, 97]
    };
  }

  return {
    bg: [248, 252, 255],
    card: [255, 255, 255],
    accent: [47, 159, 221],
    heading: [35, 48, 73],
    text: [78, 90, 112],
    chip: [255, 229, 130]
  };
}

async function downloadStoryPdf() {
  const jsPDFRef = window.jspdf?.jsPDF;
  if (!jsPDFRef) {
    showErrorPopup("PDF generator is not ready yet. Please try again.");
    return;
  }

  const title = storyTitle.textContent.trim();
  const body = storyBody.textContent.trim();
  const moral = storyMoral.textContent.trim();
  if (!title || !body) {
    showErrorPopup("Please generate a story first.");
    return;
  }

  const { bg, card, accent, heading, text, chip } = pdfPalette();
  const doc = new jsPDFRef({ orientation: "p", unit: "mm", format: "a4" });
  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  doc.setFillColor(...bg);
  doc.rect(0, 0, pageWidth, pageHeight, "F");

  doc.setFillColor(...card);
  doc.roundedRect(margin, margin, contentWidth, pageHeight - margin * 2, 6, 6, "F");

  doc.setFillColor(...chip);
  doc.roundedRect(margin + 8, margin + 8, 58, 11, 5, 5, "F");
  doc.setTextColor(...heading);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("TinyTales AI Storybook", margin + 13, margin + 15);

  doc.setDrawColor(...accent);
  doc.setLineWidth(0.8);
  doc.line(margin + 8, margin + 23, margin + contentWidth - 8, margin + 23);

  const imageX = margin + 8;
  const imageY = margin + 28;
  const imageW = 72;
  const imageH = 62;
  doc.setFillColor(232, 246, 255);
  doc.roundedRect(imageX, imageY, imageW, imageH, 4, 4, "F");

  try {
    const storyImage = await imageToDataURL(currentDrawingImage());
    if (storyImage) {
      doc.addImage(storyImage, "JPEG", imageX + 2, imageY + 2, imageW - 4, imageH - 4);
    }
  } catch {
    // Keep the soft image placeholder if image loading fails.
  }

  const textStartX = imageX + imageW + 8;
  const textWidth = contentWidth - (textStartX - margin) - 8;
  doc.setTextColor(...heading);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  const titleLines = doc.splitTextToSize(title, textWidth);
  doc.text(titleLines, textStartX, imageY + 8);

  const bodyStartY = imageY + 74;
  doc.setTextColor(...text);
  doc.setFont("times", "normal");
  doc.setFontSize(12);
  const bodyLines = doc.splitTextToSize(body, contentWidth - 16);
  doc.text(bodyLines, margin + 8, bodyStartY, { maxWidth: contentWidth - 16, lineHeightFactor: 1.6 });

  const usedBodyHeight = bodyLines.length * 6.7;
  const moralY = Math.min(bodyStartY + usedBodyHeight + 10, pageHeight - 30);
  doc.setFillColor(...chip);
  doc.roundedRect(margin + 8, moralY - 6, contentWidth - 16, 14, 4, 4, "F");
  doc.setTextColor(...heading);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11.5);
  doc.text(moral || "Moral: Kindness makes every adventure bigger.", margin + 12, moralY + 2);

  const safeTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "tinytales-story";
  doc.save(`${safeTitle}.pdf`);
}

// â”€â”€ Claude API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
/**
 * Sends the uploaded image (and an optional user hint) to Claude and returns
 * a parsed { title, body, moral } story object.
 */
async function callClaudeAPI(base64Data, mediaType, userHint = "", ageSettings = getSelectedAgeSettings()) {
  const data = await apiFetch("/api/generate-story", {
    method: "POST",
    body: JSON.stringify({
      base64Data,
      mediaType,
      userHint,
      ageSettings
    })
  });
  return data.story;
}

// â”€â”€ UI helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function showObjectConfirmation() {
  objectConfirmation.hidden = false;
  analysisMessage.textContent = "Optional: help TinyTales focus the story.";
  objectInput.value = "";
  confirmNote.textContent =
    "Describe what's in the drawing (e.g. 'red dragon on a hill'), or leave blank and let AI decide!";
}

function setUploadedPreview(file) {
  if (!file) return;

  uploadedFileName = file.name;
  uploadedMediaType = file.type || "image/png";
  fileName.textContent = file.name;
  showObjectConfirmation();
  setBusy(true);
  if (loadingOverlay) loadingOverlay.hidden = true;

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    const dataURL = reader.result;
    uploadedImageDataURL = dataURL;

    // Strip the "data:image/png;base64," prefix to get raw base64
    uploadedBase64 = dataURL.split(",")[1];

    uploadIcon.style.backgroundImage = `url("${dataURL}")`;
    dropZone.classList.add("has-preview");
    drawingPreview.innerHTML = "";
    drawingPreview.style.background = `url("${dataURL}") center / cover no-repeat`;

    // Hide the "Example drawing" label once a real image is uploaded
    const paperLabel = document.querySelector(".paper-label");
    if (paperLabel) paperLabel.style.display = "none";
    setBusy(false);
  });
  reader.readAsDataURL(file);
}

function applyStory(story) {
  const book = document.querySelector(".storybook");

  window.speechSynthesis?.cancel();
  if (readStory) readStory.textContent = "Read aloud";
  storyTitle.textContent = story.title;
  storyBody.textContent = story.body;
  storyMoral.textContent = story.moral;

  book.classList.remove("is-created");
  requestAnimationFrame(() => book.classList.add("is-created"));

  document.querySelector("#preview").scrollIntoView({ behavior: "smooth", block: "start" });
  if (storyActions) storyActions.hidden = false;
  updateSaveButtonState().catch(() => { });
}

function showError(message) {
  storyTitle.textContent = "Oops!";
  storyBody.textContent = message;
  storyMoral.textContent = "";
  document.querySelector(".storybook").classList.remove("is-created");
  requestAnimationFrame(() =>
    document.querySelector(".storybook").classList.add("is-created")
  );
  document.querySelector("#preview").scrollIntoView({ behavior: "smooth", block: "start" });
}

// â”€â”€ Event listeners â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
drawingInput.addEventListener("change", (event) => {
  setUploadedPreview(event.target.files[0]);
});

["dragenter", "dragover"].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add("is-dragging");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.remove("is-dragging");
  });
});

dropZone.addEventListener("drop", (event) => {
  const [file] = event.dataTransfer.files;
  if (!file || !file.type.startsWith("image/")) return;

  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);
  drawingInput.files = dataTransfer.files;
  setUploadedPreview(file);
});

// "Confirm" button now just saves the hint text â€” it's optional feedback
confirmObject.addEventListener("click", () => {
  const hint = normalizeObject(objectInput.value);
  if (hint) {
    confirmNote.textContent = `Got it! TinyTales will focus on "${hint}".`;
  } else {
    confirmNote.textContent = "No hint added â€” AI will read the drawing on its own.";
  }
});

objectInput.addEventListener("input", () => {
  confirmNote.textContent =
    "Describe what's in the drawing (e.g. 'red dragon on a hill'), or leave blank and let AI decide!";
});

// Main "Create Story" button â€” now async
ageToggle?.addEventListener("click", () => {
  setAgeDropdownOpen(ageOptions?.hidden);
});

ageOptions?.addEventListener("click", (event) => {
  const option = event.target.closest("[data-age]");
  if (!option) return;

  const selectedAge = option.dataset.age;
  ageRange.value = selectedAge;
  ageValue.textContent = selectedAge;
  ageOptions.querySelectorAll("[data-age]").forEach((button) => {
    button.setAttribute("aria-selected", String(button === option));
  });
  setAgeDropdownOpen(false);
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".age-selector")) {
    setAgeDropdownOpen(false);
  }
});

function getStoryReadAloudText() {
  return `${storyTitle.textContent}. ${storyBody.textContent} ${storyMoral.textContent}`.trim();
}

readStory?.addEventListener("click", () => {
  if (!("speechSynthesis" in window)) {
    showErrorPopup("Sorry, this browser does not support text to speech.");
    return;
  }

  if (window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
    readStory.textContent = "Read aloud";
    return;
  }

  const utterance = new SpeechSynthesisUtterance(getStoryReadAloudText());
  utterance.rate = 0.92;
  utterance.pitch = 1.05;
  utterance.onend = () => {
    readStory.textContent = "Read aloud";
  };
  utterance.onerror = () => {
    readStory.textContent = "Read aloud";
  };

  readStory.textContent = "Stop reading";
  window.speechSynthesis.speak(utterance);
});

printStory?.addEventListener("click", () => {
  window.speechSynthesis?.cancel();
  if (readStory) readStory.textContent = "Read aloud";
  window.print();
});

downloadPdf?.addEventListener("click", async () => {
  try {
    await downloadStoryPdf();
  } catch (error) {
    console.error("PDF generation error:", error);
    showErrorPopup("Couldn't create PDF right now. Please try again.");
  }
});

saveStory?.addEventListener("click", async () => {
  if (!authToken) {
    showErrorPopup("Please login first.");
    return;
  }
  const story = getCurrentStoryPayload();
  try {
    await apiFetch("/api/stories", {
      method: "POST",
      body: JSON.stringify(story)
    });
    await renderSavedStories();
    await updateSaveButtonState();
  } catch (error) {
    if (error.message.includes("already")) {
      await updateSaveButtonState();
      return;
    }
    showErrorPopup(error.message || "Could not save story.");
  }
});

savedStoriesGrid?.addEventListener("click", async (event) => {
  const deleteButton = event.target.closest("[data-delete-id]");
  if (!deleteButton) return;
  try {
    await apiFetch(`/api/stories/${deleteButton.dataset.deleteId}`, {
      method: "DELETE"
    });
    await renderSavedStories();
    await updateSaveButtonState();
  } catch (error) {
    showErrorPopup(error.message || "Could not delete story.");
  }
});

bedtimeToggle?.addEventListener("click", () => {
  const enabled = !document.body.classList.contains("bedtime-mode");
  setBedtimeMode(enabled);
});

async function performAuth(endpoint) {
  const email = loginEmail?.value.trim();
  const password = loginPassword?.value.trim();
  if (!email || !password) return;
  try {
    const data = await apiFetch(endpoint, {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
    authToken = data.token;
    localStorage.setItem(AUTH_TOKEN_KEY, authToken);
    const me = await apiFetch("/api/me");
    storyCount = me.storyCount || 0;
    setLoginState(true);
    await renderSavedStories();
    await updateSaveButtonState();
    document.querySelector("#top")?.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    showErrorPopup(error.message || "Authentication failed.");
  }
}

loginForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  performAuth("/api/auth/signin");
});

createAccountBtn?.addEventListener("click", () => {
  performAuth("/api/auth/signup");
});

signInBtn?.addEventListener("click", () => {
  performAuth("/api/auth/signin");
});

signOutBtn?.addEventListener("click", () => {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  authToken = "";
  storyCount = 0;
  savedStoriesGrid && (savedStoriesGrid.innerHTML = "");
  savedEmpty && (savedEmpty.hidden = false);
  setLoginState(false);
  showErrorPopup("Signed out successfully.");
});

deleteAccountBtn?.addEventListener("click", async () => {
  if (!authToken) return;
  const proceed = window.confirm("Delete your account permanently? This will remove all saved stories.");
  if (!proceed) return;
  try {
    await apiFetch("/api/auth/delete-account", { method: "DELETE" });
    localStorage.removeItem(AUTH_TOKEN_KEY);
    authToken = "";
    storyCount = 0;
    savedStoriesGrid && (savedStoriesGrid.innerHTML = "");
    savedEmpty && (savedEmpty.hidden = false);
    setLoginState(false);
    showErrorPopup("Your account was deleted.");
  } catch (error) {
    showErrorPopup(error.message || "Could not delete account.");
  }
});

errorPopupClose?.addEventListener("click", hideErrorPopup);
errorPopup?.addEventListener("click", (event) => {
  if (event.target === errorPopup) hideErrorPopup();
});

getStartedBtn?.addEventListener("click", openCreateSection);

document.querySelectorAll('a[href="#createSection"]').forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    openCreateSection();
  });
});

async function bootstrapAuth() {
  authToken = localStorage.getItem(AUTH_TOKEN_KEY) || "";
  if (!authToken) {
    setLoginState(false);
    return;
  }
  try {
    const me = await apiFetch("/api/me");
    storyCount = me.storyCount || 0;
    setLoginState(true);
    await renderSavedStories();
    await updateSaveButtonState();
  } catch {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    authToken = "";
    storyCount = 0;
    setLoginState(false);
  }
}

setBedtimeMode(localStorage.getItem(BEDTIME_MODE_KEY) === "1");
bootstrapAuth();

createStory.addEventListener("click", async () => {
  // Demo mode: no image uploaded â†’ keep the sample story
  if (storyCount >= 10) {
    document.querySelector("#upgradeMessage").hidden = false;
    document.querySelector("#create").scrollIntoView({ behavior: "smooth" });
    return;
  }
  if (!uploadedBase64) {
    applyStory({
      title: "Milo and the Kind Little Kite",
      body: "Milo drew a kite that wanted to fly higher than every cloud. But when a little tree felt lonely below, the kite dipped down and danced beside it. And so the kite soared back up, carrying the tree's laughter with it all the way to the stars. Milo learned that the brightest adventures are even better when we share our joy with a friend.",
      moral: "Moral: Kindness makes every adventure bigger."
    });
    const countData = await apiFetch("/api/story-count/increment", { method: "POST" });
    storyCount = countData.storyCount || storyCount + 1;
    return;
  }

  const userHint = normalizeObject(objectInput.value);
  const selectedAgeSettings = getSelectedAgeSettings();

  setGenerating(true);

  try {
    const story = await callClaudeAPI(uploadedBase64, uploadedMediaType, userHint, selectedAgeSettings);
    applyStory(story);
    const countData = await apiFetch("/api/story-count/increment", { method: "POST" });
    storyCount = countData.storyCount || storyCount + 1;
  } catch (err) {
    console.error("TinyTales API error:", err);
    showError(
      "TinyTales had a little trouble reading the drawing. Please check your connection and try again."
    );
  } finally {
    setGenerating(false);
  }
});

document.querySelector("#classroomBtn").addEventListener("click", () => {
  document.querySelector(".drop-title").textContent = "Upload a student's artwork here";
  document.querySelector("#analysisMessage").textContent = "Optional: add the student's name or what they drew.";
});
// â”€â”€ Pricing Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
document.querySelector("#upgradeMessage .upgrade-btn").addEventListener("click", (e) => {
  e.preventDefault();
  document.querySelector("#pricingModal").hidden = false;
});

document.querySelector("#closePricing").addEventListener("click", () => {
  document.querySelector("#pricingModal").hidden = true;
});

document.querySelector("#pricingModal").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) {
    e.currentTarget.hidden = true;
  }
});



