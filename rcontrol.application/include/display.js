/*
 * noVNC: HTML5 VNC client
 * Copyright (C) 2011 Joel Martin
 * Licensed under LGPL-3 (see LICENSE.txt)
 *
 * See README.md for usage and integration instructions.
 */

/*jslint browser: true, white: false, bitwise: false */
/*global Util, Base64, changeCursor */

function Display(defaults) {
"use strict";

var that           = {},  // Public API methods
    conf           = {},  // Configuration attributes

    // Private Display namespace variables
    c_ctx          = null,
    c_forceCanvas  = false,

    c_imageData, c_rgbxImage, c_cmapImage,

    // Predefine function variables (jslint)
    imageDataCreate, imageDataGet, rgbxImageData, cmapImageData,
    rgbxImageFill, cmapImageFill, setFillColor, rescale, flush,

    c_width        = 0,
    c_height       = 0,

    c_prevStyle    = "",

    c_webkit_bug   = false,
    c_flush_timer  = null;

// Configuration attributes
Util.conf_defaults(conf, that, defaults, [
    ['target',      'wo', 'dom',  null, 'Canvas element for rendering'],
    ['context',     'ro', 'raw',  null, 'Canvas 2D context for rendering (read-only)'],
    ['logo',        'rw', 'raw',  null, 'Logo to display when cleared: {"width": width, "height": height, "data": data}'],
    ['true_color',  'rw', 'bool', true, 'Use true-color pixel data'],
    ['colourMap',   'rw', 'arr',  [], 'Colour map array (when not true-color)'],
    ['scale',       'rw', 'float', 1.0, 'Display area scale factor 0.0 - 1.0'],
    ['width',       'rw', 'int', null, 'Display area width'],
    ['height',      'rw', 'int', null, 'Display area height'],

    ['render_mode', 'ro', 'str', '', 'Canvas rendering mode (read-only)'],

    ['prefer_js',   'rw', 'str', null, 'Prefer Javascript over canvas methods'],
    ['cursor_uri',  'rw', 'raw', null, 'Can we render cursor using data URI']
    ]);

// Override some specific getters/setters
that.get_context = function () { return c_ctx; };

that.set_scale = function(scale) { rescale(scale); };

that.set_width = function (val) { that.resize(val, c_height); };
that.get_width = function() { return c_width; };

that.set_height = function (val) { that.resize(c_width, val); };
that.get_height = function() { return c_height; };

that.set_prefer_js = function(val) {
    if (val && c_forceCanvas) {
        Util.Warn("Preferring Javascript to Canvas ops is not supported");
        return false;
    }
    conf.prefer_js = val;
    return true;
};



//
// Private functions
//

// Create the public API interface
function constructor() {
    Util.Debug(">> Display.constructor");

    var c, func, imgTest, tval, i, curDat, curSave,
        has_imageData = false, UE = Util.Engine;

    if (! conf.target) { throw("target must be set"); }

    if (typeof conf.target === 'string') {
        throw("target must be a DOM element");
    }

    c = conf.target;

    if (! c.getContext) { throw("no getContext method"); }

    if (! c_ctx) { c_ctx = c.getContext('2d'); }

    Util.Debug("User Agent: " + navigator.userAgent);
    if (UE.gecko) { Util.Debug("Browser: gecko " + UE.gecko); }
    if (UE.webkit) { Util.Debug("Browser: webkit " + UE.webkit); }
    if (UE.trident) { Util.Debug("Browser: trident " + UE.trident); }
    if (UE.presto) { Util.Debug("Browser: presto " + UE.presto); }

    that.clear();

    /*
     * Determine browser Canvas feature support
     * and select fastest rendering methods
     */
    tval = 0;
    try {
        imgTest = c_ctx.getImageData(0, 0, 1,1);
        imgTest.data[0] = 123;
        imgTest.data[3] = 255;
        c_ctx.putImageData(imgTest, 0, 0);
        tval = c_ctx.getImageData(0, 0, 1, 1).data[0];
        if (tval === 123) {
            has_imageData = true;
        }
    } catch (exc1) {}

    if (has_imageData) {
        Util.Info("Canvas supports imageData");
        c_forceCanvas = false;
        if (c_ctx.createImageData) {
            // If it's there, it's faster
            Util.Info("Using Canvas createImageData");
            conf.render_mode = "createImageData rendering";
            c_imageData = imageDataCreate;
        } else if (c_ctx.getImageData) {
            // I think this is mostly just Opera
            Util.Info("Using Canvas getImageData");
            conf.render_mode = "getImageData rendering";
            c_imageData = imageDataGet;
        }
        Util.Info("Prefering javascript operations");
        if (conf.prefer_js === null) {
            conf.prefer_js = true;
        }
        c_rgbxImage = rgbxImageData;
        c_cmapImage = cmapImageData;
    } else {
        Util.Warn("Canvas lacks imageData, using fillRect (slow)");
        conf.render_mode = "fillRect rendering (slow)";
        c_forceCanvas = true;
        conf.prefer_js = false;
        c_rgbxImage = rgbxImageFill;
        c_cmapImage = cmapImageFill;
    }

    if (UE.webkit && UE.webkit >= 534.7 && UE.webkit <= 534.9) {
        // Workaround WebKit canvas rendering bug #46319
        conf.render_mode += ", webkit bug workaround";
        Util.Debug("Working around WebKit bug #46319");
        c_webkit_bug = true;
        for (func in {"fillRect":1, "copyImage":1, "rgbxImage":1,
                "cmapImage":1, "blitStringImage":1}) {
            that[func] = (function() {
                var myfunc = that[func]; // Save original function
                //Util.Debug("Wrapping " + func);
                return function() {
                    myfunc.apply(this, arguments);
                    if (!c_flush_timer) {
                        c_flush_timer = setTimeout(flush, 100);
                    }
                };
            }());
        }
    }

    /*
     * Determine browser support for setting the cursor via data URI
     * scheme
     */
    curDat = [];
    for (i=0; i < 8 * 8 * 4; i += 1) {
        curDat.push(255);
    }
    try {
        curSave = c.style.cursor;
        changeCursor(conf.target, curDat, curDat, 2, 2, 8, 8);
        if (c.style.cursor) {
            if (conf.cursor_uri === null) {
                conf.cursor_uri = true;
            }
            Util.Info("Data URI scheme cursor supported");
        } else {
            if (conf.cursor_uri === null) {
                conf.cursor_uri = false;
            }
            Util.Warn("Data URI scheme cursor not supported");
        }
        c.style.cursor = curSave;
    } catch (exc2) { 
        Util.Error("Data URI scheme cursor test exception: " + exc2);
        conf.cursor_uri = false;
    }

    Util.Debug("<< Display.constructor");
    return that ;
}

rescale = function(factor) {
    var c, tp, x, y, 
        properties = ['transform', 'WebkitTransform', 'MozTransform', null];
    c = conf.target;
    tp = properties.shift();
    while (tp) {
        if (typeof c.style[tp] !== 'undefined') {
            break;
        }
        tp = properties.shift();
    }

    if (tp === null) {
        Util.Debug("No scaling support");
        return;
    }

    if (factor > 1.0) {
        factor = 1.0;
    } else if (factor < 0.1) {
        factor = 0.1;
    }
    
    console.log(conf.scale);
    console.log(factor);
    if (conf.scale === factor) {
        //Util.Debug("Display already scaled to '" + factor + "'");
        return;
    }

    conf.scale = factor;
    x = c.width - c.width * factor;
    y = c.height - c.height * factor;
    c.style[tp] = "scale(" + conf.scale + ") translate(-" + x + "px, -" + y + "px)";
};

// Force canvas redraw (for webkit bug #46319 workaround)
flush = function() {
    var old_val;
    //Util.Debug(">> flush");
    old_val = conf.target.style.marginRight;
    conf.target.style.marginRight = "1px";
    c_flush_timer = null;
    setTimeout(function () {
            conf.target.style.marginRight = old_val;
        }, 1);
};

setFillColor = function(color) {
    var rgb, newStyle;
    if (conf.true_color) {
        rgb = color;
    } else {
        rgb = conf.colourMap[color[0]];
    }
    newStyle = "rgb(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ")";
    if (newStyle !== c_prevStyle) {
        c_ctx.fillStyle = newStyle;
        c_prevStyle = newStyle;
    }
};


//
// Public API interface functions
//

that.resize = function(width, height) {
    console.log("Calling resize function....");
    var c = conf.target;

    console.log(c);

    c_prevStyle    = "";

    c.width = width;
    c.height = height;
    console.log("c.width : " + c.width);
    console.log("c.height : " + c.height);
    
    //screen width
    c_width  = c.offsetWidth; //1280; //
    c_height = c.offsetHeight; //800; //
    console.log("c_width : " + c_width);
    console.log("c_height : " + c_height);
    //Shylendra
    //conf.scale = c_height/c.height;
    console.log("conf.scale : " + conf.scale);
    
    if(c_height/c.height < c_width/c.width)
    rescale(c_height/c.height);//conf.scale);
    else
    rescale(c_width/c.width);//conf.scale);

};

that.clear = function() {

    if (conf.logo) {
        that.resize(conf.logo.width, conf.logo.height);
        that.blitStringImage(conf.logo.data, 0, 0);
    } else {
        that.resize(640, 20);
        c_ctx.clearRect(0, 0, c_width, c_height);
    }

    // No benefit over default ("source-over") in Chrome and firefox
    //c_ctx.globalCompositeOperation = "copy";
};

that.fillRect = function(x, y, width, height, color) {
    setFillColor(color);
    c_ctx.fillRect(x, y, width, height);
};

that.copyImage = function(old_x, old_y, new_x, new_y, width, height) {
    c_ctx.drawImage(conf.target, old_x, old_y, width, height,
                                       new_x, new_y, width, height);
};

/*
 * Tile rendering functions optimized for rendering engines.
 *
 * - In Chrome/webkit, Javascript image data array manipulations are
 *   faster than direct Canvas fillStyle, fillRect rendering. In
 *   gecko, Javascript array handling is much slower.
 */
that.getTile = function(x, y, width, height, color) {
    var img, data = [], rgb, red, green, blue, i;
    img = {'x': x, 'y': y, 'width': width, 'height': height,
           'data': data};
    if (conf.prefer_js) {
        if (conf.true_color) {
            rgb = color;
        } else {
            rgb = conf.colourMap[color[0]];
        }
        red = rgb[0];
        green = rgb[1];
        blue = rgb[2];
        for (i = 0; i < (width * height * 4); i+=4) {
            data[i    ] = red;
            data[i + 1] = green;
            data[i + 2] = blue;
        }
    } else {
        that.fillRect(x, y, width, height, color);
    }
    return img;
};

that.setSubTile = function(img, x, y, w, h, color) {
    var data, p, rgb, red, green, blue, width, j, i, xend, yend;
    if (conf.prefer_js) {
        data = img.data;
        width = img.width;
        if (conf.true_color) {
            rgb = color;
        } else {
            rgb = conf.colourMap[color[0]];
        }
        red = rgb[0];
        green = rgb[1];
        blue = rgb[2];
        xend = x + w;
        yend = y + h;
        for (j = y; j < yend; j += 1) {
            for (i = x; i < xend; i += 1) {
                p = (i + (j * width) ) * 4;
                data[p    ] = red;
                data[p + 1] = green;
                data[p + 2] = blue;
            }   
        } 
    } else {
        that.fillRect(img.x + x, img.y + y, w, h, color);
    }
};

that.putTile = function(img) {
    if (conf.prefer_js) {
        c_rgbxImage(img.x, img.y, img.width, img.height, img.data, 0);
    }
    // else: No-op, under gecko already done by setSubTile
};

imageDataGet = function(width, height) {
    return c_ctx.getImageData(0, 0, width, height);
};
imageDataCreate = function(width, height) {
    return c_ctx.createImageData(width, height);
};

rgbxImageData = function(x, y, width, height, arr, offset) {
    var img, i, j, data;
    img = c_imageData(width, height);
    data = img.data;
    for (i=0, j=offset; i < (width * height * 4); i=i+4, j=j+4) {
        data[i    ] = arr[j    ];
        data[i + 1] = arr[j + 1];
        data[i + 2] = arr[j + 2];
        data[i + 3] = 255; // Set Alpha
    }
    c_ctx.putImageData(img, x, y);
};

// really slow fallback if we don't have imageData
rgbxImageFill = function(x, y, width, height, arr, offset) {
    var i, j, sx = 0, sy = 0;
    for (i=0, j=offset; i < (width * height); i+=1, j+=4) {
        that.fillRect(x+sx, y+sy, 1, 1, [arr[j], arr[j+1], arr[j+2]]);
        sx += 1;
        if ((sx % width) === 0) {
            sx = 0;
            sy += 1;
        }
    }
};

cmapImageData = function(x, y, width, height, arr, offset) {
    var img, i, j, data, rgb, cmap;
    img = c_imageData(width, height);
    data = img.data;
    cmap = conf.colourMap;
    for (i=0, j=offset; i < (width * height * 4); i+=4, j+=1) {
        rgb = cmap[arr[j]];
        data[i    ] = rgb[0];
        data[i + 1] = rgb[1];
        data[i + 2] = rgb[2];
        data[i + 3] = 255; // Set Alpha
    }
    c_ctx.putImageData(img, x, y);
};

cmapImageFill = function(x, y, width, height, arr, offset) {
    var i, j, sx = 0, sy = 0, cmap;
    cmap = conf.colourMap;
    for (i=0, j=offset; i < (width * height); i+=1, j+=1) {
        that.fillRect(x+sx, y+sy, 1, 1, [arr[j]]);
        sx += 1;
        if ((sx % width) === 0) {
            sx = 0;
            sy += 1;
        }
    }
};


that.blitImage = function(x, y, width, height, arr, offset) {
    if (conf.true_color) {
        c_rgbxImage(x, y, width, height, arr, offset);
    } else {
        c_cmapImage(x, y, width, height, arr, offset);
    }
};

that.blitStringImage = function(str, x, y) {
    var img = new Image();
    img.onload = function () { c_ctx.drawImage(img, x, y); };
    img.src = str;
};

that.changeCursor = function(pixels, mask, hotx, hoty, w, h) {
    if (conf.cursor_uri === false) {
        Util.Warn("changeCursor called but no cursor data URI support");
        return;
    }

    if (conf.true_color) {
        changeCursor(conf.target, pixels, mask, hotx, hoty, w, h);
    } else {
        changeCursor(conf.target, pixels, mask, hotx, hoty, w, h, conf.colourMap);
    }
};

that.defaultCursor = function() {
    conf.target.style.cursor = "default";
};

return constructor();  // Return the public API interface

}  // End of Display()


/* Set CSS cursor property using data URI encoded cursor file */
function changeCursor(target, pixels, mask, hotx, hoty, w, h, cmap) {
    "use strict";
    var cur = [], rgb, IHDRsz, RGBsz, ANDsz, XORsz, url, idx, alpha, x, y;
    //Util.Debug(">> changeCursor, x: " + hotx + ", y: " + hoty + ", w: " + w + ", h: " + h);
    
    // Push multi-byte little-endian values
    cur.push16le = function (num) {
        this.push((num     ) & 0xFF,
                  (num >> 8) & 0xFF  );
    };
    cur.push32le = function (num) {
        this.push((num      ) & 0xFF,
                  (num >>  8) & 0xFF,
                  (num >> 16) & 0xFF,
                  (num >> 24) & 0xFF  );
    };

    IHDRsz = 40;
    RGBsz = w * h * 4;
    XORsz = Math.ceil( (w * h) / 8.0 );
    ANDsz = Math.ceil( (w * h) / 8.0 );

    // Main header
    cur.push16le(0);      // 0: Reserved
    cur.push16le(2);      // 2: .CUR type
    cur.push16le(1);      // 4: Number of images, 1 for non-animated ico

    // Cursor #1 header (ICONDIRENTRY)
    cur.push(w);          // 6: width
    cur.push(h);          // 7: height
    cur.push(0);          // 8: colors, 0 -> true-color
    cur.push(0);          // 9: reserved
    cur.push16le(hotx);   // 10: hotspot x coordinate
    cur.push16le(hoty);   // 12: hotspot y coordinate
    cur.push32le(IHDRsz + RGBsz + XORsz + ANDsz);
                          // 14: cursor data byte size
    cur.push32le(22);     // 18: offset of cursor data in the file


    // Cursor #1 InfoHeader (ICONIMAGE/BITMAPINFO)
    cur.push32le(IHDRsz); // 22: Infoheader size
    cur.push32le(w);      // 26: Cursor width
    cur.push32le(h*2);    // 30: XOR+AND height
    cur.push16le(1);      // 34: number of planes
    cur.push16le(32);     // 36: bits per pixel
    cur.push32le(0);      // 38: Type of compression

    cur.push32le(XORsz + ANDsz); // 43: Size of Image
                                 // Gimp leaves this as 0

    cur.push32le(0);      // 46: reserved
    cur.push32le(0);      // 50: reserved
    cur.push32le(0);      // 54: reserved
    cur.push32le(0);      // 58: reserved

    // 62: color data (RGBQUAD icColors[])
    for (y = h-1; y >= 0; y -= 1) {
        for (x = 0; x < w; x += 1) {
            idx = y * Math.ceil(w / 8) + Math.floor(x/8);
            alpha = (mask[idx] << (x % 8)) & 0x80 ? 255 : 0;

            if (cmap) {
                idx = (w * y) + x;
                rgb = cmap[pixels[idx]];
                cur.push(rgb[2]);          // blue
                cur.push(rgb[1]);          // green
                cur.push(rgb[0]);          // red
                cur.push(alpha);           // alpha
            } else {
                idx = ((w * y) + x) * 4;
                cur.push(pixels[idx + 2]); // blue
                cur.push(pixels[idx + 1]); // green
                cur.push(pixels[idx    ]); // red
                cur.push(alpha);           // alpha
            }
        }
    }

    // XOR/bitmask data (BYTE icXOR[])
    // (ignored, just needs to be right size)
    for (y = 0; y < h; y += 1) {
        for (x = 0; x < Math.ceil(w / 8); x += 1) {
            cur.push(0x00);
        }
    }

    // AND/bitmask data (BYTE icAND[])
    // (ignored, just needs to be right size)
    for (y = 0; y < h; y += 1) {
        for (x = 0; x < Math.ceil(w / 8); x += 1) {
            cur.push(0x00);
        }
    }

    url = "data:image/x-icon;base64," + Base64.encode(cur);
    target.style.cursor = "url(" + url + ") " + hotx + " " + hoty + ", default";
    //Util.Debug("<< changeCursor, cur.length: " + cur.length);
}
