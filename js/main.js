// --- (Tùy chọn) Nếu cần unlock audio trên mobile, thêm hàm này và liên kết với sự kiện tương tác ---
// let audioUnlocked = false;
// function unlockAudio() {
//   if (!audioUnlocked) {
//     const silentAudio = new Audio();
//     silentAudio.play().then(() => {
//       audioUnlocked = true;
//       console.log("Audio đã được mở khóa!");
//     }).catch(err => console.error("Không unlock được audio:", err));
//   }
// }
// document.addEventListener('touchstart', unlockAudio, { once: true });
// document.addEventListener('click', unlockAudio, { once: true });


// Lấy các phần tử DOM cần thiết
const videoElement = document.getElementById("video");
const canvasElement = document.getElementById("output_canvas");
const canvasCtx = canvasElement.getContext("2d");

const blinkTimeDisplay = document.getElementById("blink_time");
const recognitionStatusDisplay = document.getElementById("recognition_status");
const selectionStatusDisplay = document.getElementById("selection_status");
const optionElements = document.querySelectorAll(".option");

// ----- Các ngưỡng thời gian (ms) -----
// Ngưỡng EAR mặc định dùng cho máy tính
let EAR_THRESHOLD = 0.25;
// Thời gian để bật/tắt chế độ nhận diện
const RECOGNITION_TOGGLE_DURATION = 3000;  
// Thời gian để bật chế độ chọn nếu nhận diện đang bật
const SELECTION_TOGGLE_DURATION = 1000;    
// Blink quá nhanh (< QUICK_BLINK_THRESHOLD ms) sẽ chuyển ô (quét)
const QUICK_BLINK_THRESHOLD = 120;         
// Blink từ CONFIRM_SELECTION_THRESHOLD ms đến dưới CANCEL_SELECTION_THRESHOLD ms: xác nhận lựa chọn nhưng vẫn giữ chế độ chọn
const CONFIRM_SELECTION_THRESHOLD = 1000;  
// Blink kéo dài ≥ 1500ms: tắt chế độ chọn
const CANCEL_SELECTION_THRESHOLD = 1500;   

// Nếu chạy trên thiết bị di động, điều chỉnh ngưỡng EAR cho phù hợp
if (/Mobi|Android/i.test(navigator.userAgent)) {
  EAR_THRESHOLD = 0.20;
  console.log("Chạy trên di động, đặt EAR_THRESHOLD =", EAR_THRESHOLD);
}

// ----- Các biến trạng thái -----
let isClosed = false;           // true nếu mắt đang đóng
let closedStartTime = 0;        // Thời điểm bắt đầu nhắm mắt
let recognitionMode = false;    // Chế độ nhận diện (On/Off)
let selectionMode = false;      // Chế độ chọn (On/Off)
let selectionIndex = 0;         // Vị trí của ô đang được highlight

// ----- Utility Functions -----
function distance(p1, p2) {
  return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}

// Tính toán EAR từ landmark các đầu mút (vị trí được truyền qua indices)
function computeEAR(landmarks, indices) {
  const vertical1 = distance(landmarks[indices[1]], landmarks[indices[5]]);
  const vertical2 = distance(landmarks[indices[2]], landmarks[indices[4]]);
  const horizontal = distance(landmarks[indices[0]], landmarks[indices[3]]);
  return (vertical1 + vertical2) / (2.0 * horizontal);
}

// Cập nhật giao diện trạng thái (bật/tắt màu ô thông tin)
function updateInfoBoxes() {
  recognitionStatusDisplay.classList.toggle("on", recognitionMode);
  selectionStatusDisplay.classList.toggle("on", selectionMode);
}

// Highlight ô được chọn (dùng class "holder")
function highlightOption(index) {
  optionElements.forEach((el, i) => {
    el.classList.toggle("holder", i === index);
  });
}

function clearOptionHighlight() {
  optionElements.forEach(el => el.classList.remove("holder"));
}

// Khi xác nhận lựa chọn, phát file MP3 tương ứng với option (đặt file MP3 trong folder "sound")
function confirmOption() {
  const selectedOption = optionElements[selectionIndex];
  playSoundById(selectedOption.id);
  // Giữ lại highlight (vẫn ở chế độ chọn) để báo hiệu đó là ô đã được xác nhận
}

// Phát file âm thanh theo ID của option
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

// ----- Các chỉ số landmark cho mắt (theo MediaPipe Face Mesh) -----
const leftEyeIndices = [33, 160, 158, 133, 153, 144];
const rightEyeIndices = [263, 387, 385, 362, 380, 373];

// ----- Hàm xử lý kết quả từ Face Mesh -----
function onResults(results) {
  // Vẽ hình từ webcam lên canvas
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
  
  if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) return;
  
  const landmarks = results.multiFaceLandmarks[0];
  const leftEAR = computeEAR(landmarks, leftEyeIndices);
  const rightEAR = computeEAR(landmarks, rightEyeIndices);
  // Nếu cả hai mắt đều nhỏ hơn giá trị ngưỡng, coi là "đóng"
  const eyesClosed = (leftEAR < EAR_THRESHOLD && rightEAR < EAR_THRESHOLD);
  
  if (eyesClosed) {
    if (!isClosed) {
      isClosed = true;
      closedStartTime = Date.now();
    }
    blinkTimeDisplay.textContent = `${((Date.now() - closedStartTime) / 1000).toFixed(2)} s`;
  } else {
    // Khi mắt mở lại
    if (isClosed) {
      const duration = Date.now() - closedStartTime;
      blinkTimeDisplay.textContent = `${(duration / 1000).toFixed(2)} s`;
      
      if (recognitionMode && selectionMode) {
        // Khi chế độ nhận diện và chọn đang bật (đã active):
        if (duration >= CANCEL_SELECTION_THRESHOLD) {
          // Nếu blink kéo dài ≥ 1.5s: tắt chế độ chọn, clear highlight
          selectionMode = false;
          selectionStatusDisplay.textContent = "Off";
          clearOptionHighlight();
        } else if (duration >= CONFIRM_SELECTION_THRESHOLD && duration < CANCEL_SELECTION_THRESHOLD) {
          // Nếu blink từ 1s đến dưới 1.5s: xác nhận lựa chọn (phát file MP3) nhưng vẫn giữ chế độ chọn
          confirmOption();
        } else if (duration >= QUICK_BLINK_THRESHOLD && duration < CONFIRM_SELECTION_THRESHOLD) {
          // Nếu blink từ 120ms đến dưới 1s: chuyển highlight sang ô tiếp theo (quét)
          selectionIndex = (selectionIndex + 1) % optionElements.length;
          highlightOption(selectionIndex);
        }
      } else {
        // Nếu chưa bật chế độ nhận diện (recognitionMode) hay chế độ chọn (selectionMode):
        if (!recognitionMode) {
          if (duration >= RECOGNITION_TOGGLE_DURATION) {
            // Nếu blink đủ 3s, bật chế độ nhận diện
            recognitionMode = true;
            recognitionStatusDisplay.textContent = "On";
          }
        } else if (recognitionMode && !selectionMode) {
          if (duration >= RECOGNITION_TOGGLE_DURATION) {
            // Nếu blink đủ 3s, tắt chế độ nhận diện (reset)
            recognitionMode = false;
            recognitionStatusDisplay.textContent = "Off";
          } else if (duration >= SELECTION_TOGGLE_DURATION) {
            // Nếu blink từ 1s trở lên, bật chế độ chọn
            selectionMode = true;
            selectionStatusDisplay.textContent = "On";
            selectionIndex = 0;
            highlightOption(selectionIndex);
          }
        }
      }
      
      updateInfoBoxes();
      // Reset trạng thái
      isClosed = false;
      closedStartTime = 0;
    }
  }
}
