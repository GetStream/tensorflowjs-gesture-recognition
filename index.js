const config = {
  video: { width: 640, height: 480, fps: 30 },
};
let videoWidth, videoHeight, drawingContext, canvas, gestureEstimator;
let model;

const gestureStrings = {
  thumbs_up: '👍',
  victory: '✌🏻',
  thumbs_down: '👎',
};

const fingerLookupIndices = {
  thumb: [0, 1, 2, 3, 4],
  indexFinger: [0, 5, 6, 7, 8],
  middleFinger: [0, 9, 10, 11, 12],
  ringFinger: [0, 13, 14, 15, 16],
  pinky: [0, 17, 18, 19, 20],
};

const landmarkColors = {
  thumb: 'red',
  indexFinger: 'blue',
  middleFinger: 'yellow',
  ringFinger: 'green',
  pinky: 'pink',
  palmBase: 'white',
};

function createThumbsDownGesture() {
  const thumbsDown = new fp.GestureDescription('thumbs_down');

  thumbsDown.addCurl(fp.Finger.Thumb, fp.FingerCurl.NoCurl);
  thumbsDown.addDirection(
    fp.Finger.Thumb,
    fp.FingerDirection.VerticalDown,
    1.0
  );
  thumbsDown.addDirection(
    fp.Finger.Thumb,
    fp.FingerDirection.DiagonalDownLeft,
    0.9
  );
  thumbsDown.addDirection(
    fp.Finger.Thumb,
    fp.FingerDirection.DiagonalDownRight,
    0.9
  );

  for (let finger of [
    fp.Finger.Index,
    fp.Finger.Middle,
    fp.Finger.Ring,
    fp.Finger.Pinky,
  ]) {
    thumbsDown.addCurl(finger, fp.FingerCurl.FullCurl, 0.9);
    thumbsDown.addCurl(finger, fp.FingerCurl.HalfCurl, 0.9);
  }

  return thumbsDown;
}

function drawKeypoints(keypoints) {
  for (let i = 0; i < keypoints.length; i++) {
    const y = keypoints[i][0];
    const x = keypoints[i][1];
    drawPoint(x - 2, y - 2, 3);
  }

  const fingers = Object.keys(fingerLookupIndices);
  for (let i = 0; i < fingers.length; i++) {
    const finger = fingers[i];
    const points = fingerLookupIndices[finger].map((idx) => keypoints[idx]);
    drawPath(points, false, landmarkColors[finger]);
  }
}

function drawPoint(y, x, r) {
  drawingContext.beginPath();
  drawingContext.arc(x, y, r, 0, 2 * Math.PI);
  drawingContext.fill();
}

function drawPath(points, closePath, color) {
  drawingContext.strokeStyle = color;
  const region = new Path2D();
  region.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) {
    const point = points[i];
    region.lineTo(point[0], point[1]);
  }

  if (closePath) {
    region.closePath();
  }
  drawingContext.stroke(region);
}

async function loadWebcam(width, height, fps) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error(
      'Browser API navigator.mediaDevices.getUserMedia is not available'
    );
  }

  let video = document.getElementById('webcam');
  video.muted = true;
  video.width = width;
  video.height = height;

  const mediaConfig = {
    audio: false,
    video: {
      facingMode: 'user',
      width: width,
      height: height,
      frameRate: { max: fps },
    },
  };

  const stream = await navigator.mediaDevices.getUserMedia(mediaConfig);
  video.srcObject = stream;

  return new Promise((resolve) => {
    video.onloadedmetadata = () => {
      resolve(video);
    };
  });
}

async function loadVideo() {
  const video = await loadWebcam(
    config.video.width,
    config.video.height,
    config.video.fps
  );
  video.play();
  return video;
}
async function continuouslyDetectLandmarks(video) {
  async function runDetection() {
    drawingContext.drawImage(
      video,
      0,
      0,
      videoWidth,
      videoHeight,
      0,
      0,
      canvas.width,
      canvas.height
    );

    // Draw hand landmarks
    const predictions = await model.estimateHands(video);
    if (predictions.length > 0) {
      const result = predictions[0].landmarks;
      drawKeypoints(result, predictions[0].annotations);
    }

    if (
      predictions.length > 0 &&
      Object.keys(predictions[0]).includes('landmarks')
    ) {
      const est = gestureEstimator.estimate(predictions[0].landmarks, 9);
      if (est.gestures.length > 0) {
        // Find gesture with highest match score
        let result = est.gestures.reduce((p, c) => {
          return p.score > c.score ? p : c;
        });

        if (result.score > 9.9) {
          document.getElementById('gesture-text').textContent =
            gestureStrings[result.name];
        }
      }
    }

    requestAnimationFrame(runDetection);
  }

  // Initialize gesture detection
  const knownGestures = [
    fp.Gestures.VictoryGesture,
    fp.Gestures.ThumbsUpGesture,
    createThumbsDownGesture(),
  ];

  gestureEstimator = new fp.GestureEstimator(knownGestures);

  model = await handpose.load();
  runDetection();
}

async function main() {
  let video = await loadVideo();

  videoWidth = video.videoWidth;
  videoHeight = video.videoHeight;

  canvas = document.getElementById('canvas');
  canvas.width = videoWidth;
  canvas.height = videoHeight;

  drawingContext = canvas.getContext('2d');
  drawingContext.clearRect(0, 0, videoWidth, videoHeight);

  drawingContext.fillStyle = 'white';
  drawingContext.translate(canvas.width, 0);
  drawingContext.scale(-1, 1);

  continuouslyDetectLandmarks(video);
}

main();
