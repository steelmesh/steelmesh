# GeoJS

A library of javascript types and utilities useful for Geospatial applications and libraries.  Written with the intention of being both useful in the browser and on the server.

## Plugin Architecture

The library is designed to be lightweight and only implements minimal functionality at a core level.  To provide additional power, plugins are provided and can be included quite simply.

In the land of browsers, either include as a script or as part of your application build file (if you use something like [Sprockets](http://getsprockets.com/)):

```html
<script src="js/geojs/plugins/plugin.js"></script>
```

And if you are working with [NodeJS](http://nodejs.org/) or other [CommonJS](http://commonjs.org/) implementations then you can use the `GeoJS.include` function to mixin additional functionality:

```js
var GeoJS = require('geojs');

GeoJS.include('compressor,routing');
```

