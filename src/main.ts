import "./style.css";

const canvas = document.getElementById("canvas") as HTMLCanvasElement;

const width = 100;
const height = 100;

canvas.width = width;
canvas.height = height;

const imageData = new ImageData(width, height);
const destBuffer = new Uint32Array(imageData.data.buffer);

destBuffer[0] = 0xff00ff00;

const context = canvas.getContext("2d")!;
context.putImageData(imageData, 0, 0, 0, 0, width, height);
