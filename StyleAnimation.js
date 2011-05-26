/**
 * @file
 * jQuery-inspired, library-less JavaScript function for DOM animation. 
 * Works in a similar way to jQuery's animate() or CSS 3 transitions -
 * - transits (is it a proper word?) current css property state to that
 * defined by property map. 
 * 
 * As of now, it only handles numeric properties (e.g. height, width) in different
 * measurment units (px, pt, %). Other types, like color, will be added later
 * (or you may do it by yourself - it's quite easily expendable).
 * 
 * Doesn't require any additional libraries and works in all modern browsers,
 * and by modern I mean IE 6+.
 * 
 * @author Radek Pycka
 * @license MIT (see LICENSE file)
 * @version 0.1
 */


/**
 * Main utility function. Usually the only used directly by user (not counting
 * animation object methods, like .start() & .stop()).
 * A wrapper for Animation object constructor, automatically starts animation.
 * 
 *
 * @param element	element or array-like set of elements to animate (required)
 * @param props		a map (simple object) with properties designating which css properties to use and theirs targeted values (required)
 * @param duration	duration of animation, 500 ms by default (optional)
 * @param callback	function fired after animation completion (optional, NOT WORKING YET!)
 * @param easing	function mapping time to advancement, linear by default (might be provided as function object or name of built-in function)
 *  
 * @return Animation object
 */
function StyleAnimation(element, props, duration, callback, easing) {
	
	// wrap into an array if not an array already - crude as hell
	try {
		if (!Object.prototype.toString.call(element) === '[object Array]' || (!element.length)) {
			element = [element];
		}
	}
	catch (e) {
		element = [element];
	}
	
	var animation = new StyleAnimation.Animation(element, props, duration, callback, easing);
	animation.start();
	
	return animation;
}


/**
 * Constructor for animation objects. Will be returned by StyleAnimation function
 * and will contain methods for remote controlling (like: stop() and play()).
 * 
 * @param elements		array or array-like object with DOM elements which will be affected
 * @param properties	map of properties and targeted values
 * @param duration		length of animation, in useconds [optional]
 * @param callback		callback to be run at completion of animation (called once for all!) [optional]
 * @param easing		function dictating dynamics of changes through animation, linear function "y = x" by default
 * @return Animation object
 */
StyleAnimation.Animation = function (elements, properties, duration, callback, easing) {
	
	var getRawProperty = StyleAnimation.getComputedStyle;
	
	this.elements = [];
	this.count = elements.length;
	this.duration = duration || 500;
	this.easing = (easing && (Object.prototype.toString.call(easing) === '[object Function]' 
						  || StyleAnimation.dynamics[easing]))	// if it is a name
				  || StyleAnimation.dynamics.linear;			// default
	this.callback = callback;

	for (var i = 0, len = this.count ; i < len ; ++i) {
		var node = elements[i];
		var element = {
			node : node
		};
		
		var props = [];
		for (var property in properties) {
			if (properties.hasOwnProperty(property)) {
				var accessor = StyleAnimation.properties[property] || StyleAnimation.accessors.numeric;
				var prop = {
					name : property,
					accessor : accessor,
					start : accessor.get(getRawProperty(node, property)),
					target : accessor.get(properties[property])
				};
				
				props.push(prop);
			}
		}
		element.properties = props;
		this.propertyCount = props.length;
			
		this.elements.push(element);
	}

	return this;
};

/**
 * Stop animation. 
 */
StyleAnimation.Animation.prototype.stop = function () {
	this.cancel = true;
};

/**
 * Start animation. Restarting/rewinding animation is currently not supported, but
 * this method might be called more than once, to unknown result.
 */
StyleAnimation.Animation.prototype.start = function () {
	var that = this;
	this.cancel = false;
	this.startTime = StyleAnimation.utime();
	this.requestAnimationFrame(function () {
		that.animate();
	});
};

/**
 * Abstraction for requestAnimationFrame method, providing fallback for browsers
 * not supporting it (basically everything besides Fx 4+ and Chrome (10+, not sure)).
 * 
 * Fallback timer resolution is 10 ms and is under heavy investigation as it might
 * cause some performance drops on less powerfull hardware.
 */
StyleAnimation.Animation.prototype.requestAnimationFrame = (function (window) {
	if (window.mozRequestAnimationFrame) {
		return function (callback) {
			mozRequestAnimationFrame(callback);
		};
	}
	else if (window.webkitRequestAnimationFrame) {
		return function (callback) {
			webkitRequestAnimationFrame(callback);
		};
	}
	else {
		return function (callback) {
			this.timer = setTimeout(callback, 10);
		};
	}
})(window);
	
StyleAnimation.Animation.prototype.animate = function (now) {
	var that = this;
	if (!this.cancel) {
		(now = StyleAnimation.utime());
		var progress = (now - this.startTime) / this.duration;
		if (progress < 1) {
			for (var i = 0, len = this.count ; i < len ; ++i) {
				var element = this.elements[i];
				for (var j = 0, len2 = this.propertyCount ; j < len2 ; ++j) {
					var property = element.properties[j];
					var updated = property.accessor.update(property.start, property.target, this.easing(progress));
					property.accessor.set(element.node, property.name, property.start, updated);
				}
			}
			
			this.requestAnimationFrame(function () {
				that.animate();
			});		
		}
		else {
			for (var i = 0, len = this.count ; i < len ; ++i) {
				var element = this.elements[i];
				for (var j = 0, len2 = this.propertyCount ; j < len2 ; ++j) {
					this.cancel = true;
					var property = element.properties[j];
					property.accessor.set(element.node, property.name, property.start, property.target);
					this.callback && (this.callback());
				}
			}
		}
	}
};


/**
 * CSS property accessors, grouped into threes of getter (.get), setter (.set) and
 * updater (.update):
 * 
 * - get (raw) -> returns property object (e.g. {value : 1, unit: 'px'} for numeric accessor)
 * - set (DomElement, name, value) -> takes element and property name & property object and updates element
 * - update (startValue, targetValue, progress) - calculates property object for current animation progression (marked as float between 0.0 and 1.0)
 * 
 * By default provided 
 */
StyleAnimation.accessors = {};

/**
 * Numeric accessor manages values in this pattern [-+]?(int|float)(unit)?.
 * Most common properties served are:
 *  - dimensional (width, height, paddings), 
 *  - positional (margins, offsets: top, left, bottom, right)
 * 
 * When writing (set method) will use unit found with getter on initial property value. 
 */
StyleAnimation.accessors.numeric = {
	get : function (raw) {
		var re = /([.0-9+-]+)([^.0-9+-]+)?/;
		var prop = null;
		var matches = re.exec(raw);
		if (matches) {
			prop = {
				value : matches[1] >>> 0,
				unit : matches[2] || null
			};
		}	
		return prop;
	},
	set : function (node, name, start, current) {
		node.style[name] = current.value + (start.unit || '');
	},
	update : function (start, target, progress) {
		var distance = (target.value - start.value) * progress;
		return {
			value : start.value + distance,
			unit : start.unit
		};
	}
};

/**
 * Mapping between properties and accessors. All properties not-defined-here will
 * be matched against numeric accessor (which is great for all kinds of positioning 
 * and dimensions, but not for color, f. i.)).
 */
StyleAnimation.properties = {};


/**
 * Container for animation dynamics implementations. Use this freely for your own.
 * By default uses linear easing.
 */
StyleAnimation.dynamics = {};
StyleAnimation.dynamics.linear = function (x) {
	return x;
};

/* crude & ugly, temp */
StyleAnimation.dynamics.logarithmic = function (x) {
	return (Math.log(x*100) / Math.log(100));
}

// HELPERS - for crossbrowser

/**
 * Cross-browser computed style getter. Can be used freely outside SA.
 * 
 * @param element	DOM element
 * @param element	CSS property name in camel case format, e.g. marginLeft instead of margin-left
 * @return computed CSS property value
 */
StyleAnimation.getComputedStyle = (function (window, document) {
	if (window.getComputedStyle) {
		return function (element, name) {
			return window.getComputedStyle(element, null)[name];
		}
	}
	else if (document.documentElement.currentStyle) {
		return function (element, name) {
			return element.currentStyle[name];
		}
	}
	else {
		throw new Error('StyleAnimation: no supported getter for computed CSS properties found');
	}
		
})(window, document);


/**
 * Get current timestamp with microsecond resolution.
 */
StyleAnimation.utime = (function () {
	if (Date.now) {
		return function () {
			return Date.now();
		};
	}
	else {
		return function () {
			return new Date();
		};
	}
})();

