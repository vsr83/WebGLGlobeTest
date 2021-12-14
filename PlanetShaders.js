/**
 * Class implementing the shaders for drawing of planets.
 */
class PlanetShaders
{
    /**
     * Constructor.
     * 
     * @param {WebGLRenderingContext} gl
     *      The WebGL rendering context to use.
     * @param {*} nLon
     *      Number of longitude divisions.
     * @param {*} nLat 
     *      Number of latitude divisions.
     * @param {*} a 
     *      Equatorial radius.
     * @param {*} b
     *      Polar radius.
     */
    constructor(gl, nLon, nLat, a, b)
    {
        this.gl = gl;
        this.a = a;
        this.b = b;
        this.nLat = nLat;
        this.nLon = nLon;

        this.vertShaderSphere = `#version 300 es
        // an attribute is an input (in) to a vertex shader.
        // It will receive data from a buffer
        in vec4 a_position;
        in vec2 a_texcoord;
        
        // A matrix to transform the positions by
        uniform mat4 u_matrix;
        
        // a varying to pass the texture coordinates to the fragment shader
        out vec2 v_texcoord;
        
        // all shaders have a main function
        void main() {
          // Multiply the position by the matrix.
          gl_Position = u_matrix * a_position;
        
          // Pass the texcoord to the fragment shader.
          v_texcoord = a_texcoord;
        }
        `;
        
        this.fragShaderSphere = `#version 300 es
        
        precision highp float;
        #define PI 3.1415926538
        #define A 6378137.0
        #define B 6356752.314245
        #define E 0.081819190842965
        #define R_EARTH 6371000.0
        
        // Passed in from the vertex shader.
        in vec2 v_texcoord;
        
        // The texture.
        uniform sampler2D u_imageDay;
        uniform sampler2D u_imageNight;

        // 
        uniform float u_decl;
        uniform float u_rA;
        uniform float u_LST;
        
        // we need to declare an output for the fragment shader
        out vec4 outColor;
        
        float deg2rad(in float deg)
        {
            return 2.0 * PI * deg / 360.0; 
        }

        float rad2deg(in float rad)
        {
            return 360.0 * rad / (2.0 * PI);
        }
        
        void main() 
        {
            float lon = 2.0 * PI * (v_texcoord.x - 0.5);
            float lat = PI * (v_texcoord.y - 0.5);
            float LSTlon = u_LST + lon;
            float h = LSTlon - u_rA;
            float altitude = asin(cos(h)*cos(u_decl)*cos(lat) + sin(u_decl)*sin(lat));
            altitude = rad2deg(altitude);

            if (abs(lon) < 0.01 || abs(lat) < 0.01 || abs(lon - PI*0.5) < 0.01)
            {
                //outColor = texture(u_imageDay, v_texcoord);
            }
            else
            {
                //outColor = texture(u_imageNight, v_texcoord);
            }

            if (altitude > 0.0)
            {
                // Day. 
                outColor = texture(u_imageDay, v_texcoord);
            }
            else if (altitude > -6.0)
            {
                // Civil twilight.
                outColor = (0.5*texture(u_imageNight, v_texcoord) + 1.5*texture(u_imageDay, v_texcoord)) * 0.5;
            }
            else if (altitude > -12.0)
            {
                // Nautical twilight.
                outColor = (texture(u_imageNight, v_texcoord) + texture(u_imageDay, v_texcoord)) * 0.5;
            }
            else if (altitude > -18.0)
            {
                // Astronomical twilight.
                outColor = (1.5*texture(u_imageNight, v_texcoord) + 0.5*texture(u_imageDay, v_texcoord)) * 0.5;
            }
            else
            {
                // Night.
                outColor = texture(u_imageNight, v_texcoord);
            }    

        }
        `;
    }

    /**
     * Initialize shaders, buffers and textures.
     * 
     * @param {String} srcTextureDay
     *      URL of the texture for the iluminated part of the sphere. 
     * @param {String} srcTextureNight 
     *      URL of the texture for the non-iluminated part of the sphere.
     */
    init(srcTextureDay, srcTextureNight)
    {
        let gl = this.gl;
        this.program = webglUtils.createProgramFromSources(gl, [this.vertShaderSphere, this.fragShaderSphere]);

        // Get attribute and uniform locations.
        this.posAttrLocation = gl.getAttribLocation(this.program, "a_position");
        this.texAttrLocation = gl.getAttribLocation(this.program, "a_texcoord");
        this.matrixLocation = gl.getUniformLocation(this.program, "u_matrix");

        this.vertexArrayPlanet = gl.createVertexArray();
        gl.bindVertexArray(this.vertexArrayPlanet);

        // Load planet vertex coordinates into a buffer.
        let positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        this.setGeometry(gl);
        gl.enableVertexAttribArray(this.posAttrLocation);
        gl.vertexAttribPointer(this.posAttrLocation, 3, gl.FLOAT, false, 0, 0);

        // Load texture vertex coordinates into a buffer.
        const texcoordBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, texcoordBuffer);
        this.setTexcoords(gl);
        gl.enableVertexAttribArray(this.texAttrLocation);
        gl.vertexAttribPointer(this.texAttrLocation, 2, gl.FLOAT, true, 0, 0);

        // Load textures:
        const imageDay = new Image();
        imageDay.src = srcTextureDay;
        const imageLocationDay = gl.getUniformLocation(this.program, "u_imageDay");
        
        const imageNight = new Image();
        imageNight.src = srcTextureNight;
        const imageLocationNight = gl.getUniformLocation(this.program, "u_imageNight");
        
        this.numTextures = 0;
        let instance = this;
        imageDay.addEventListener('load', function() {
            instance.loadTexture(0, imageDay, imageLocationDay);
        });
        imageNight.addEventListener('load', function() {
            instance.loadTexture(1, imageNight, imageLocationNight);
        });
            
        gl.useProgram(this.program);
    }

    /**
     * Load texture.
     * 
     * @param {Number} index 
     *      Index of the texture.
     * @param {Image} image 
     *      The image to be loaded.
     * @param {WebGLUniformLocation} imageLocation 
     *      Uniform location for the texture.
     */
    loadTexture(index, image, imageLocation)
    {
        let gl = this.gl;

        // Create a texture.
        var texture = gl.createTexture();

        // use texture unit 0
        gl.activeTexture(gl.TEXTURE0 + index);

        // bind to the TEXTURE_2D bind point of texture unit 0
        gl.bindTexture(gl.TEXTURE_2D, texture);

        // Fill the texture with a 1x1 blue pixel.
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
            new Uint8Array([0, 0, 255, 255]));
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.uniform1i(imageLocation, index);
        this.numTextures = this.numTextures + 1;
    }

    /**
     * Insert array of numbers into Float32Array;
     * 
     * @param {*} buffer 
     *      Target buffer.
     * @param {*} index 
     *      Start index.
     * @param {*} arrayIn 
     *      Array to be inserted.
     */
    insertBufferFloat32(buffer, index, arrayIn)
    {
        for (let indArray = 0; indArray < arrayIn.length; indArray++)
        {
            buffer[index + indArray] = arrayIn[indArray]; 
        }
    }

    /**
     * Insert square segment of a sphere into a Float32Buffer.
     * 
     * @param {*} buffer 
     *      The target buffer.
     * @param {*} indRect 
     *      The index of the rectangle.
     * @param {*} lonStart 
     *      Longitude start of the rectangle.
     * @param {*} lonEnd 
     *      Longitude end of the rectangle.
     * @param {*} latStart 
     *      Latitude start of the rectangle.
     * @param {*} latEnd 
     *      Latitude end of the rectangle.
     */
    insertRectGeo(buffer, indRect, lonStart, lonEnd, latStart, latEnd)
    {
        const indStart = indRect * 3 * 6;

        const x1 = this.a * Math.cos(latStart) * Math.cos(lonStart);
        const y1 = this.a * Math.cos(latStart) * Math.sin(lonStart);
        const z1 = this.b * Math.sin(latStart);
        const x2 = this.a * Math.cos(latStart) * Math.cos(lonEnd);
        const y2 = this.a * Math.cos(latStart) * Math.sin(lonEnd);
        const z2 = this.b * Math.sin(latStart);
        const x3 = this.a * Math.cos(latEnd) * Math.cos(lonEnd);
        const y3 = this.a * Math.cos(latEnd) * Math.sin(lonEnd);
        const z3 = this.b * Math.sin(latEnd);
        const x4 = this.a * Math.cos(latEnd) * Math.cos(lonStart);
        const y4 = this.a * Math.cos(latEnd) * Math.sin(lonStart);
        const z4 = this.b * Math.sin(latEnd);

        this.insertBufferFloat32(buffer, indStart, [x1,y1,z1, x2,y2,z2, x3,y3,z3, 
            x1,y1,z1, x3,y3,z3, x4,y4,z4]);
    }

    /**
     * Fill vertex buffer for sphere triangles.
     */
    setGeometry() 
    {
        const gl = this.gl;
        const nTri = this.nLon * this.nLat * 2;
        const nPoints = nTri * 3;
        const positions = new Float32Array(nPoints * 3);

        for (let lonStep = 0; lonStep < this.nLon; lonStep++)
        {
            const lon = 2 * Math.PI * lonStep / this.nLon;
            const lonNext = 2 * Math.PI * (lonStep + 1) / this.nLon;

            for (let latStep = 0; latStep <= this.nLat-1; latStep++)
            {
                const lat =  Math.PI * (-0.5 + latStep / this.nLat);
                const latNext = Math.PI * (-0.5 + (latStep + 1) / this.nLat);
                const indTri = latStep + lonStep * this.nLat;
                this.insertRectGeo(positions, indTri, lon, lonNext, lat, latNext, 1);
            }  
        }
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    }
    
    /**
     * Insert a texture coordinates for a square segment.
     * 
     * @param {*} buffer
     *      Target buffer. 
     * @param {*} indRect 
     *      Index of the rectangle.
     * @param {*} lonStart 
     *      Longitude start (radians).
     * @param {*} lonEnd 
     *      Longitude end (radians).
     * @param {*} latStart
     *      Latitude start (radians). 
     * @param {*} latEnd 
     *      Latitude end (radians).
     */
    insertRectTex(buffer, indRect, lonStart, lonEnd, latStart, latEnd)
    {
        const indStart = indRect * 2 * 6;
        const uLonStart = 1-(lonStart / (2 * Math.PI));
        const uLonEnd =   1-(lonEnd / (2 * Math.PI));
        const uLatStart = (latStart) / Math.PI + 0.5;
        const uLatEnd =  (latEnd) / Math.PI + 0.5;

        this.insertBufferFloat32(buffer, indStart, 
            [uLonStart, uLatStart, uLonEnd, uLatStart, uLonEnd,   uLatEnd,
             uLonStart, uLatStart, uLonEnd, uLatEnd,   uLonStart, uLatEnd]);
    }

    /**
     * Fill vertex buffer for textures
     */
    setTexcoords() 
    {
        const gl = this.gl;
        const nTri = this.nLon * this.nLat * 2;
        const nPoints = nTri * 3;
        const positions = new Float32Array(nPoints * 2);

        for (let lonStep = 0; lonStep <= this.nLon; lonStep++)
        {
            const lon = 2 * Math.PI * lonStep / this.nLon;
            const lonNext = 2 * Math.PI * (lonStep + 1) / this.nLon;

            for (let latStep = 0; latStep <= this.nLat; latStep++)
            {
                const lat =  Math.PI * (-0.5 + latStep / this.nLat);
                const latNext = Math.PI * (-0.5 + (latStep + 1) / this.nLat);
                const indTri = latStep + lonStep * this.nLat;

                this.insertRectTex(positions, indTri, lon, lonNext, lat, latNext);
            }  
        }
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    }

    /**
     * Draw the planet.
     * 
     * @param {*} viewMatrix 
     *      The view matrix.
     * @param {*} rA
     *      The right ascension of the light source.
     * @param {*} decl
     *      The declination of the light source.
     */
    draw(viewMatrix, rA, decl, LST)
    {
        if (this.numTextures < 2)
        {
            return;
        }
        const gl = this.gl;

        gl.useProgram(this.program);
        gl.bindVertexArray(this.vertexArrayPlanet);
        gl.uniformMatrix4fv(this.matrixLocation, false, viewMatrix);

        const raLocation = gl.getUniformLocation(this.program, "u_rA");
        const declLocation = gl.getUniformLocation(this.program, "u_decl");
        const lstLocation = gl.getUniformLocation(this.program, "u_LST");
        gl.uniform1f(raLocation, rA);
        gl.uniform1f(declLocation, decl);
        gl.uniform1f(lstLocation, LST);

        // Draw the geometry.
        const primitiveType = gl.TRIANGLES;
        const offset = 0;
        const nTri = this.nLon * this.nLat * 2;
        const count = nTri * 3;
        gl.drawArrays(primitiveType, offset, count);
    }
}