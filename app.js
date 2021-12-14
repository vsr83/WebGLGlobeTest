"use strict";

var gl = null;
var earthShaders = null;
var a = 2.0;
var b = 2.0;

var distance = 8;

function degToRad(d) 
{
    return d * Math.PI / 180;
}

var fieldOfViewRadians = degToRad(30);
var rotX = degToRad(90);
var rotY = degToRad(0);
var rotZ = degToRad(0);
var rotXStart = 0;
var rotYStart = 0;
var rotZStart = 0;
var xStart = 0;
var yStart = 0;

var dragX = 0;
var dragY = 0;
var dragXStart = 0;
var dragYStart = 0;

// Get the starting time.
var then = 0;

// Get A WebGL context
/** @type {HTMLCanvasElement} */
var canvas = document.querySelector("#canvas");

canvas.addEventListener("mousedown", function(e) {
    xStart = e.clientX;
    yStart = e.clientY;
    dragXStart = dragX;
    dragYStart = dragY;

    console.log("xStart " + xStart);

    canvas.onmousemove = function(m) {
        //console.log(m);
        dragX = dragXStart - (m.clientX - xStart) / 100.0;
        dragY = dragYStart - (m.clientY - yStart) / 100.0;

        rotZ = dragX;
        rotX = 90 - dragY;
    }
});

canvas.addEventListener("mouseup", function(e) {
    canvas.onmousemove = null;
});

document.addEventListener("wheel", function(e) {
    distance += e.deltaY / 1000;
});

gl = canvas.getContext("webgl2");
if (!gl) 
{
    console.log("Failed to initialize GL.");
}
earthShaders = new PlanetShaders(gl, 150, 150, a, b);
earthShaders.init("8k_earth_daymap.jpg", "8k_earth_nightmap.jpg");

requestAnimationFrame(drawScene);

// Draw the scene.
function drawScene(time) 
{
    const today = new Date();

    const julianTimes = TimeConversions.computeJulianTime(today);
    const JD = julianTimes.JD;
    const JT = julianTimes.JT;
    const JDref = Math.ceil(TimeConversions.computeJulianDay(2000, 1, 1));

    // Compute equitorial coordinates of the Sun.
    const sunAltitude = new SunAltitude();
    const eqCoordsSun = sunAltitude.computeEquitorial(JT, JD);
    const rASun = eqCoordsSun.rA;
    const declSun = -eqCoordsSun.decl;

    // Compute equitorial coordinates of the Moon.
    const moonAltitude = new MoonAltitude();
    const eqCoordsMoon = moonAltitude.computeEquitorial(JT);
    const rAMoon = eqCoordsMoon.rA;
    const declMoon = eqCoordsMoon.decl;

    // Compute sidereal time perform modulo to avoid floating point accuracy issues with 32-bit
    // floats in the shader:
    const LST = MathUtils.deg2Rad(TimeConversions.computeSiderealTime(0, JD, JT)) % 360.0;





    // Clear the canvas
    gl.clearColor(0, 0, 0, 255);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // convert to seconds
    time *= 0.001;
    // Subtract the previous time from the current time
    var deltaTime = time - then;
    // Remember the current time for the next frame.
    then = time;

    webglUtils.resizeCanvasToDisplaySize(gl.canvas);

    // Tell WebGL how to convert from clip space to pixels
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    // Animate the rotation
    //modelYRotationRadians += 0*-0.7 * deltaTime;
    //modelXRotationRadians += 0*-0.4 *0* deltaTime;
    //modelZRotationRadians += 0.4 *0* deltaTime;

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);

    // Compute the matrix
    var aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
    var zNear = 0.1;
    var zFar = 5000;
    var projectionMatrix = m4.perspective(fieldOfViewRadians, aspect, zNear, zFar);

    var cameraPosition = [0, 0, distance];
    var up = [0, 1, 0];
    var target = [0, 0, 0];

    // Compute the camera's matrix using look at.
    var cameraMatrix = m4.lookAt(cameraPosition, target, up);

    // Make a view matrix from the camera matrix.
    var viewMatrix = m4.inverse(cameraMatrix);

    var viewProjectionMatrix = m4.multiply(projectionMatrix, viewMatrix);

    var matrix = m4.xRotate(viewProjectionMatrix, rotX);
    matrix = m4.yRotate(matrix, rotY);
    matrix = m4.zRotate(matrix, rotZ);

    earthShaders.draw(matrix, rASun, declSun, LST);
    // Call drawScene again next frame
    requestAnimationFrame(drawScene);
}
