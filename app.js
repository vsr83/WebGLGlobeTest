"use strict";

var gl = null;
var earthShaders = null;
var lineShaders = null;
var a = 6378.1370;
var b = 6356.75231414;

var distance = 3.0 * a;

function degToRad(d) 
{
    return d * Math.PI / 180;
}

var fieldOfViewRadians = degToRad(30);
var rotX = degToRad(90);
var rotY = degToRad(0);
var rotZ = degToRad(0);
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

canvas.addEventListener("mouseleave", function(e) {
    canvas.onmousemove = null;
});

document.addEventListener("wheel", function(e) {
    distance *= (e.deltaY * 0.0001 + 1);
});

gl = canvas.getContext("webgl2");
if (!gl) 
{
    console.log("Failed to initialize GL.");
}
earthShaders = new PlanetShaders(gl, 50, 50, a, b);
earthShaders.init("8k_earth_daymap.jpg", "8k_earth_nightmap.jpg");

lineShaders = new LineShaders(gl);
lineShaders.init();

requestAnimationFrame(drawScene);

// Draw the scene.
function drawScene(time) 
{
    ISS.osv = ISS.osvIn;

    gl.useProgram(earthShaders.program);
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

    ISS.kepler = Kepler.osvToKepler(ISS.osv.r, ISS.osv.v, ISS.osv.ts);
    ISS.osvProp = Kepler.propagate(ISS.kepler, today);
    let kepler_updated = Kepler.osvToKepler(ISS.osvProp.r, ISS.osvProp.v, ISS.osvProp.ts);
    let osv_ECEF = Frames.osvJ2000ToECEF(ISS.osvProp);
    ISS.r_ECEF = osv_ECEF.r;
    ISS.v_ECEF = osv_ECEF.v;
    let wgs84 = Coordinates.cartToWgs84(ISS.r_ECEF);

    ISS.alt = wgs84.h; 
    ISS.lon = wgs84.lon;
    ISS.lat = wgs84.lat;
    const alt = MathUtils.norm(ISS.r_ECEF);

    ISS.x = -alt * 0.001 * MathUtils.cosd(ISS.lat) * MathUtils.cosd(ISS.lon);
    ISS.y =  alt * 0.001 * MathUtils.cosd(ISS.lat) * MathUtils.sind(ISS.lon);
    ISS.z = -alt * 0.001 * MathUtils.sind(ISS.lat);

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
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);

    // Compute the matrix
    var aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
    var zNear = (distance - b) / 2;
    var zFar = a * 50.0;
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

    let p = [];
    const period = Kepler.computePeriod(kepler_updated.a, kepler_updated.mu);

    const jdStep = period / 1000;
    for (let jdDelta = -period; jdDelta < period; jdDelta += jdStep)
    {
        const deltaDate = new Date(today.getTime() +  1000 * jdDelta);
        const osvProp = Kepler.propagate(kepler_updated, deltaDate);
        const osv_ECEF = Frames.osvJ2000ToECEF(osvProp);
        const r_ECEF = osv_ECEF.r;
        const lon = MathUtils.atan2d(r_ECEF[1], r_ECEF[0]);
        const lat = MathUtils.rad2Deg(Math.asin(r_ECEF[2] / MathUtils.norm(r_ECEF)));
        const alt = MathUtils.norm(r_ECEF);

        const x = alt * 0.001 * MathUtils.cosd(lat) * MathUtils.cosd(lon);
        const y = alt * 0.001 * MathUtils.cosd(lat) * MathUtils.sind(lon);
        const z = alt * 0.001 * MathUtils.sind(lat);

        p.push([-x, y, -z]);
        if (jdDelta != -period)
        {
            p.push([-x, y, -z]);
        }
    }

    lineShaders.setGeometry(p);
    lineShaders.draw(matrix);

    matrix = m4.translate(matrix, ISS.x, ISS.y, ISS.z);
    matrix = m4.scale(matrix, 0.01, 0.01, 0.01);
    earthShaders.draw(matrix, rASun, declSun, LST);

    //earthShaders.draw(matrix, rASun, declSun, LST);
    // Call drawScene again next frame
    requestAnimationFrame(drawScene);
}
