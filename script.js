// --- DOM Selectors Helper ---
const $ = id => document.getElementById(id);

// --- Global App State ---
let files = [];
let currentIndex = 0;
let rawImage = new Image();
let originalSize = 0;
let cropper = null;

// Transformations & Filters
let rotation = 0;
let flipH = 1;
let flipV = 1;
let currentBlob = null;

// Zoom & Pan state
let scale = 1;
let pointX = 0;
let pointY = 0;
let startX = 0;
let startY = 0;
let isDragging = false;

// --- Init & Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  setupEvents();
  setupZoomPan();
});

/* ---------- Theme Switcher ---------- */
function initTheme() {
  const isDark = localStorage.getItem('theme') !== 'light';
  document.body.setAttribute('data-theme', isDark ? 'dark' : 'light');
  $('themeToggle').textContent = isDark ? '🌙' : '☀️';
}

$('themeToggle').onclick = () => {
  const current = document.body.getAttribute('data-theme');
  const target = current === 'dark' ? 'light' : 'dark';
  document.body.setAttribute('data-theme', target);
  localStorage.setItem('theme', target);
  $('themeToggle').textContent = target === 'dark' ? '🌙' : '☀️';
};

/* ---------- Event Listeners Setup ---------- */
function setupEvents() {
  const dropZone = $('dropZone');
  const fileInput = $('fileInput');

  dropZone.onclick = () => fileInput.click();
  fileInput.onchange = e => handleFiles(e.target.files);

  ['dragover', 'dragleave', 'drop'].forEach(ev => {
    dropZone.addEventListener(ev, e => {
      e.preventDefault();
      dropZone.classList.toggle('hover', ev === 'dragover');
      if (ev === 'drop') handleFiles(e.dataTransfer.files);
    });
  });

  // Mode & Presets
  document.querySelectorAll('input[name=mode]').forEach(r => r.onchange = updateUnits);
  $('presetSelect').onchange = applyPreset;

  // Dimensions Sync
  $('aspectLock').onchange = syncDimensions;
  $('widthIn').oninput = () => syncDimensions('w');
  $('heightIn').oninput = () => syncDimensions('h');

  // Live Auto Updates on Slider change
  ['fBrightness', 'fContrast', 'fSaturation', 'fGrayscale', 'fSepia'].forEach(id => {
    $(id).oninput = () => {
      updateFilterLabels();
      renderImage();
    };
  });

  $('resetFilters').onclick = resetFilters;

  // Transform Buttons
  $('rotateBtn').onclick = () => { rotation = (rotation + 90) % 360; renderImage(); };
  $('flipHBtn').onclick = () => { flipH *= -1; renderImage(); };
  $('flipVBtn').onclick = () => { flipV *= -1; renderImage(); };

  // Crop Toggle
  $('cropToggleBtn').onclick = toggleCrop;

  // Export & Formats
  $('fmtSelect').onchange = () => {
    $('qualityWrapper').style.display = $('fmtSelect').value === 'image/png' ? 'none' : 'block';
    renderImage();
  };
  $('qualityRange').oninput = () => {
    $('qualityVal').textContent = $('qualityRange').value + '%';
    renderImage();
  };
  $('targetKb').oninput = debounce(() => renderImage(), 400);

  // Actions
  $('downloadBtn').onclick = downloadSingle;
  $('batchProcessBtn').onclick = processBatchZip;
  $('newBtn').onclick = () => location.reload();
}

/* ---------- File Handling ---------- */
function handleFiles(selectedFiles) {
  files = Array.from(selectedFiles).filter(f => f.type.startsWith('image/'));
  if (!files.length) return alert('দয়া করে একটি বৈধ ইমেজ ফাইল সিলেক্ট করুন');

  $('dropCard').classList.add('hidden');
  $('workspace').classList.remove('hidden');

  if (files.length > 1) {
    $('batchSection').classList.remove('hidden');
    $('batchCount').textContent = files.length;
    renderBatchList();
  }

  loadSingleFile(0);
}

function renderBatchList() {
  const list = $('fileList');
  list.innerHTML = '';
  files.forEach((f, idx) => {
    const li = document.createElement('li');
    li.textContent = `${idx + 1}. ${f.name}`;
    if (idx === currentIndex) li.classList.add('active');
    li.onclick = () => loadSingleFile(idx);
    list.appendChild(li);
  });
}

function loadSingleFile(index) {
  currentIndex = index;
  if ($('batchSection').className.indexOf('hidden') === -1) renderBatchList();

  const file = files[index];
  originalSize = file.size;

  const reader = new FileReader();
  reader.onload = e => {
    rawImage = new Image();
    rawImage.onload = () => {
      resetTransforms();
      updateUnits();
      $('widthIn').value = rawImage.naturalWidth;
      $('heightIn').value = rawImage.naturalHeight;
      renderImage();
    };
    rawImage.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function resetTransforms() {
  rotation = 0; flipH = 1; flipV = 1;
  resetFilters();
  if (cropper) { cropper.destroy(); cropper = null; $('cropToggleBtn').textContent = '✂️ ক্রপ মোড'; }
}

/* ---------- Preset & Dimension Functions ---------- */
function updateUnits() {
  const isPct = document.querySelector('input[name=mode]:checked').value === 'pct';
  document.querySelectorAll('.unitLabel').forEach(el => el.textContent = isPct ? '%' : 'px');
  if (rawImage.naturalWidth) {
    $('widthIn').value = isPct ? 100 : rawImage.naturalWidth;
    $('heightIn').value = isPct ? 100 : rawImage.naturalHeight;
  }
}

function applyPreset() {
  const val = $('presetSelect').value;
  const presets = {
    fb_cover: [820, 312],
    fb_post: [1200, 630],
    ig_post: [1080, 1080],
    yt_thumb: [1280, 720],
    email: [600, 400]
  };

  if (presets[val]) {
    document.querySelector('input[name=mode][value=px]').checked = true;
    updateUnits();
    $('aspectLock').checked = false;
    $('widthIn').value = presets[val][0];
    $('heightIn').value = presets[val][1];
    renderImage();
  }
}

function syncDimensions(changed) {
  if (!$('aspectLock').checked || !rawImage.naturalWidth) return;
  const isPct = document.querySelector('input[name=mode]:checked').value === 'pct';

  if (changed === 'w') {
    const ratio = rawImage.naturalHeight / rawImage.naturalWidth;
    $('heightIn').value = isPct ? $('widthIn').value : Math.round($('widthIn').value * ratio);
  } else {
    const ratio = rawImage.naturalWidth / rawImage.naturalHeight;
    $('widthIn').value = isPct ? $('heightIn').value : Math.round($('heightIn').value * ratio);
  }
  renderImage();
}

/* ---------- Filters Engine ---------- */
function resetFilters() {
  ['fBrightness', 'fContrast', 'fSaturation'].forEach(id => $(id).value = 100);
  ['fGrayscale', 'fSepia'].forEach(id => $(id).value = 0);
  updateFilterLabels();
  renderImage();
}

function updateFilterLabels() {
  $('vBrightness').textContent = $('fBrightness').value + '%';
  $('vContrast').textContent = $('fContrast').value + '%';
  $('vSaturation').textContent = $('fSaturation').value + '%';
  $('vGrayscale').textContent = $('fGrayscale').value + '%';
  $('vSepia').textContent = $('fSepia').value + '%';
}

function getFilterString() {
  return `brightness(${$('fBrightness').value}%) contrast(${$('fContrast').value}%) saturate(${$('fSaturation').value}%) grayscale(${$('fGrayscale').value}%) sepia(${$('fSepia').value}%)`;
}

/* ---------- Cropper Integration ---------- */
function toggleCrop() {
  const imgEl = $('mainImage');
  if (cropper) {
    const canvas = cropper.getCroppedCanvas();
    rawImage = new Image();
    rawImage.onload = () => {
      cropper.destroy();
      cropper = null;
      $('cropToggleBtn').textContent = '✂️ ক্রপ মোড';
      $('widthIn').value = rawImage.naturalWidth;
      $('heightIn').value = rawImage.naturalHeight;
      renderImage();
    };
    rawImage.src = canvas.toDataURL();
  } else {
    cropper = new Cropper(imgEl, {
      viewMode: 1,
      autoCropArea: 0.8,
      background: false
    });
    $('cropToggleBtn').textContent = '✓ ক্রপ প্রয়োগ করুন';
  }
}

/* ---------- Rendering Canvas Engine ---------- */
function renderImage() {
  if (!rawImage.naturalWidth || cropper) return;

  const isPct = document.querySelector('input[name=mode]:checked').value === 'pct';
  let targetW = parseFloat($('widthIn').value) || rawImage.naturalWidth;
  let targetH = parseFloat($('heightIn').value) || rawImage.naturalHeight;

  if (isPct) {
    targetW = Math.round((rawImage.naturalWidth * targetW) / 100);
    targetH = Math.round((rawImage.naturalHeight * targetH) / 100);
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  // Handle Rotations & Dimensions Swap
  if (rotation === 90 || rotation === 270) {
    canvas.width = targetH;
    canvas.height = targetW;
  } else {
    canvas.width = targetW;
    canvas.height = targetH;
  }

  ctx.save();

  // Apply Transformations
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.scale(flipH, flipV);
  ctx.filter = getFilterString();

  const drawW = (rotation === 90 || rotation === 270) ? targetH : targetW;
  const drawH = (rotation === 90 || rotation === 270) ? targetW : targetH;

  ctx.drawImage(rawImage, -drawW / 2, -drawH / 2, drawW, drawH);
  ctx.restore();

  // Export MIME & Target Compression Check
  let mime = $('fmtSelect').value;
  if (mime === 'auto') mime = files[currentIndex].type || 'image/png';

  const initialQuality = parseInt($('qualityRange').value) / 100;
  const targetKbVal = parseFloat($('targetKb').value);

  if (targetKbVal && targetKbVal > 0 && mime !== 'image/png') {
    compressToTargetSize(canvas, mime, targetKbVal, b => finalizeRender(b, canvas.width, canvas.height));
  } else {
    canvas.toBlob(b => finalizeRender(b, canvas.width, canvas.height), mime, initialQuality);
  }
}

function compressToTargetSize(canvas, mime, targetKb, callback) {
  let low = 0.05, high = 1.0, mid = 0.85;
  let bestBlob = null;

  const check = (iter) => {
    canvas.toBlob(b => {
      bestBlob = b;
      const kb = b.size / 1024;
      if (iter > 8 || Math.abs(kb - targetKb) < 10) {
        return callback(bestBlob);
      }
      if (kb > targetKb) high = mid;
      else low = mid;
      mid = (low + high) / 2;
      check(iter + 1);
    }, mime, mid);
  };
  check(0);
}

function finalizeRender(blob, w, h) {
  currentBlob = blob;
  $('mainImage').src = URL.createObjectURL(blob);

  // Update Stats UI
  $('statOrig').textContent = `${rawImage.naturalWidth} × ${rawImage.naturalHeight} | ${formatBytes(originalSize)}`;
  $('statNew').textContent = `${w} × ${h} | ${formatBytes(blob.size)}`;

  const diff = ((blob.size - originalSize) / originalSize * 100).toFixed(1);
  const diffEl = $('statDiff');
  diffEl.textContent = (diff <= 0 ? '' : '+') + diff + '%';
  diffEl.className = 'badge ' + (diff <= 0 ? 'success' : 'warn');
}

/* ---------- Pan & Zoom Controls ---------- */
function setupZoomPan() {
  const container = $('viewport');
  const zoomWrapper = $('zoomWrapper');

  container.onwheel = e => {
    e.preventDefault();
    const xs = (e.clientX - pointX) / scale;
    const ys = (e.clientY - pointY) / scale;
    const delta = -e.deltaY;

    delta > 0 ? (scale *= 1.1) : (scale /= 1.1);
    scale = Math.min(Math.max(0.5, scale), 5); // Limit zoom range 0.5x to 5x

    pointX = e.clientX - xs * scale;
    pointY = e.clientY - ys * scale;

    zoomWrapper.style.transform = `translate(${pointX}px, ${pointY}px) scale(${scale})`;
  };

  container.onmousedown = e => {
    isDragging = true;
    startX = e.clientX - pointX;
    startY = e.clientY - pointY;
  };

  window.onmousemove = e => {
    if (!isDragging) return;
    pointX = e.clientX - startX;
    pointY = e.clientY - startY;
    zoomWrapper.style.transform = `translate(${pointX}px, ${pointY}px) scale(${scale})`;
  };

  window.onmouseup = () => isDragging = false;
}

/* ---------- Download & Export Handlers ---------- */
function downloadSingle() {
  if (!currentBlob) return;
  const ext = currentBlob.type.split('/')[1] || 'png';
  const name = files[currentIndex].name.replace(/\.[^/.]+$/, "") + `_resized.${ext}`;
  
  const a = document.createElement('a');
  a.href = URL.createObjectURL(currentBlob);
  a.download = name;
  a.click();
}

async function processBatchZip() {
  if (!files.length) return;
  const zip = new JSZip();
  const btn = $('batchProcessBtn');
  btn.disabled = true;
  btn.textContent = '⏳ প্রসেসিং হচ্ছে...';

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const blob = await processSingleBlobForBatch(file);
    const ext = blob.type.split('/')[1] || 'png';
    zip.file(`${file.name.replace(/\.[^/.]+$/, "")}_resized.${ext}`, blob);
  }

  zip.generateAsync({ type: 'blob' }).then(content => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(content);
    a.download = 'PixelResize_Batch.zip';
    a.click();
    btn.disabled = false;
    btn.textContent = '⚡ সবগুলো ব্যাচ ডাউনলোড (ZIP)';
  });
}

function processSingleBlobForBatch(file) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        const isPct = document.querySelector('input[name=mode]:checked').value === 'pct';
        let targetW = parseFloat($('widthIn').value) || img.naturalWidth;
        let targetH = parseFloat($('heightIn').value) || img.naturalHeight;

        if (isPct) {
          targetW = Math.round((img.naturalWidth * targetW) / 100);
          targetH = Math.round((img.naturalHeight * targetH) / 100);
        }

        canvas.width = targetW;
        canvas.height = targetH;
        ctx.filter = getFilterString();
        ctx.drawImage(img, 0, 0, targetW, targetH);

        let mime = $('fmtSelect').value;
        if (mime === 'auto') mime = file.type || 'image/png';
        canvas.toBlob(blob => resolve(blob), mime, parseInt($('qualityRange').value) / 100);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// Helpers
function formatBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(2) + ' MB';
}

function debounce(func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

/* ---------- Image to PDF Functionality ---------- */

// ১. সিঙ্গেল (একক) ছবিকে PDF হিসেবে ডাউনলোড করা
function downloadSinglePDF() {
  if (!currentBlob) return;

  const { jsPDF } = window.jspdf;
  const reader = new FileReader();

  reader.onload = function (e) {
    const imgData = e.target.result;
    
    // ইমেজের সাইজ অনুযায়ী PDF পেজ সেট করা
    const pdf = new jsPDF({
      orientation: rawImage.naturalWidth > rawImage.naturalHeight ? 'l' : 'p',
      unit: 'px',
      format: [rawImage.naturalWidth, rawImage.naturalHeight]
    });

    pdf.addImage(imgData, 'JPEG', 0, 0, rawImage.naturalWidth, rawImage.naturalHeight);
    
    const fileName = files[currentIndex].name.replace(/\.[^/.]+$/, "") + '.pdf';
    pdf.save(fileName);
  };

  reader.readAsDataURL(currentBlob);
}

// ২. ব্যাচ আকারে একাধিক ছবিকে একটি একক PDF ফাইলে রূপান্তর করা
async function processBatchPDF() {
  if (!files.length) return;
  
  const { jsPDF } = window.jspdf;
  const btn = $('batchPdfBtn');
  btn.disabled = true;
  btn.textContent = '⏳ PDF তৈরি হচ্ছে...';

  let pdf = null;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    // আমরা প্রসেস করা ফাইল অথবা অরিজিনাল ফাইল থেকে ব্লব নিব
    const blob = await processSingleBlobForBatch(file);
    const dataUrl = await blobToDataURL(blob);

    const tempImg = new Image();
    await new Promise(res => { tempImg.onload = res; tempImg.src = dataUrl; });

    const width = tempImg.naturalWidth;
    const height = tempImg.naturalHeight;
    const orientation = width > height ? 'l' : 'p';

    if (i === 0) {
      // প্রথম পেজ তৈরি
      pdf = new jsPDF({
        orientation: orientation,
        unit: 'px',
        format: [width, height]
      });
    } else {
      // পরবর্তী ছবিগুলোর জন্য নতুন পেজ যোগ করা
      pdf.addPage([width, height], orientation);
    }

    pdf.addImage(dataUrl, 'JPEG', 0, 0, width, height);
  }

  pdf.save('PixelResize_Images.pdf');
  btn.disabled = false;
  btn.textContent = '📑 সব ছবি একসাথে PDF করুন';
}

// Helper: Blob কে DataURL এ রূপান্তর
function blobToDataURL(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

// Event Listeners যুক্ত করা (setupEvents ফিল্ডের ভেতরে অথবা বাইরে)
if ($('downloadPdfBtn')) $('downloadPdfBtn').onclick = downloadSinglePDF;
if ($('batchPdfBtn')) $('batchPdfBtn').onclick = processBatchPDF;