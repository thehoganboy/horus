// Lấy các phần tử DOM cần thiết
const videoElement = document.getElementById("video");
const canvasElement = document.getElementById("output_canvas");
const canvasCtx = canvasElement.getContext("2d");

const blinkTimeDisplay = document.getElementById("blink_time");
const recognitionStatusDisplay = document.getElementById("recognition_status");
const selectionStatusDisplay = document.getElementById("selection_status");
const optionElements = document.querySelectorAll(".option");

// ----- Các ngưỡng thời gian (ms) -----
const EAR_THRESHOLD = 0.25;                        // Ngưỡng EAR cho mắt đóng
const RECOGNITION_TOGGLE_DURATION = 3000;          // ≥ 3s để bật/tắt chế độ nhận diện
const SELECTION_TOGGLE_DURATION = 1000;            // ≥ 1.5s để bật chế độ chọn (khi nhận diện đã bật)
const QUICK_BLINK_THRESHOLD = 120;                 // Nhắm mắt nhanh để chuyển ô
const CONFIRM_SELECTION_THRESHOLD = 1000;          // ≥ 1s để xác nhận lựa chọn và phát âm thanh
if (/Mobi|Android/i.test(navigator.userAgent)) {
  EAR_THRESHOLD = 0.20;
  console.log("Chạy trên thiết bị di động, đặt EAR_THRESHOLD =", EAR_THRESHOLD);
}
// ----- Các biến trạng thái -----
let isClosed = false;
let closedStartTime = 0;
let recognitionMode = false;
let selectionMode = false;
let selectionIndex = 0;

// ----- Utility Functions -----
function distance(p1, p2) {
  return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}

function computeEAR(landmarks, indices) {
  const vertical1 = distance(landmarks[indices[1]], landmarks[indices[5]]);
  const vertical2 = distance(landmarks[indices[2]], landmarks[indices[4]]);
  const horizontal = distance(landmarks[indices[0]], landmarks[indices[3]]);
  
  return (vertical1 + vertical2) / (2.0 * horizontal);
}

// 🔹 Cập nhật màu của các ô trạng thái
function updateInfoBoxes() {
  recognitionStatusDisplay.classList.toggle("on", recognitionMode);
  selectionStatusDisplay.classList.toggle("on", selectionMode);
}

// 🔹 Căn chỉnh ô lựa chọn
function highlightOption(index) {
  optionElements.forEach((el, i) => {
    el.classList.toggle("holder", i === index);
  });
}

function clearOptionHighlight() {
  optionElements.forEach(el => el.classList.remove("holder"));
}

// 🔹 Phát file âm thanh từ folder "sound"
function playSoundById(optionId) {
  const audio = new Audio(`sound/${optionId}.mp3`);
  audio.play().catch(err => console.error("Lỗi khi phát âm thanh:", err));
}

// ----- Khởi tạo MediaPipe Face Mesh & Camera -----
const faceMesh = new FaceMesh({
  locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
});
faceMesh.setOptions({
  maxNumFaces: 1,
  refineLandmarks: true,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5
});
faceMesh.onResults(onResults);

const camera = new Camera(videoElement, {
  onFrame: async () => {
    await faceMesh.send({ image: videoElement });
  },
  width: 500,
  height: 350
});
camera.start();

// ----- Các chỉ số landmark cho mắt -----
const leftEyeIndices = [33, 160, 158, 133, 153, 144];
const rightEyeIndices = [263, 387, 385, 362, 380, 373];

// ----- Xử lý Face Mesh -----
function onResults(results) {
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
  
  if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) return;
  
  const landmarks = results.multiFaceLandmarks[0];
  const leftEAR = computeEAR(landmarks, leftEyeIndices);
  const rightEAR = computeEAR(landmarks, rightEyeIndices);
  const eyesClosed = (leftEAR < EAR_THRESHOLD && rightEAR < EAR_THRESHOLD);
  
  if (eyesClosed) {
    if (!isClosed) {
      isClosed = true;
      closedStartTime = Date.now();
    }
    blinkTimeDisplay.textContent = `${((Date.now() - closedStartTime) / 1000).toFixed(2)} s`;
  } else {
    if (isClosed) { 
      const duration = Date.now() - closedStartTime;
      blinkTimeDisplay.textContent = `${(duration / 1000).toFixed(2)} s`;
      
      if (recognitionMode && selectionMode) {
        if (duration >= CONFIRM_SELECTION_THRESHOLD) {
          // Xác nhận lựa chọn: lấy ID của ô hiện tại và phát âm thanh
          const selectedOption = optionElements[selectionIndex];
          playSoundById(selectedOption.id);
          selectionMode = false;
          selectionStatusDisplay.textContent = "Off";
          clearOptionHighlight();
        } else if (duration >= QUICK_BLINK_THRESHOLD && duration < CONFIRM_SELECTION_THRESHOLD) {
          // Nhắm mắt nhanh: chuyển sang ô tiếp theo
          selectionIndex = (selectionIndex + 1) % optionElements.length;
          highlightOption(selectionIndex);
        }
      } else {
        if (!recognitionMode) {
          if (duration >= RECOGNITION_TOGGLE_DURATION) {
            recognitionMode = true;
            recognitionStatusDisplay.textContent = "On";
          }
        } else if (recognitionMode && !selectionMode) {
          if (duration >= RECOGNITION_TOGGLE_DURATION) {
            recognitionMode = false;
            recognitionStatusDisplay.textContent = "Off";
          } else if (duration >= SELECTION_TOGGLE_DURATION) {
            selectionMode = true;
            selectionStatusDisplay.textContent = "On";
            selectionIndex = 0;
            highlightOption(selectionIndex);
          }
        }
      }
      
      updateInfoBoxes();
      isClosed = false;
      closedStartTime = 0;
    }
  }
}
