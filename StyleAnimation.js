/**
 * StyleAnimation
 * 
 * -- Xbrowser utility for CSS transitions  --
 * 
 * @author Radek Pycka
 * @see README file
 * @license MIT (see LICENSE file)
 * @version 0.1
 */


/**
 * A wrapper for Animation object constructor, automatically starts animation.
 * See StyleAnimation.Animation for details on usage.
 * 
 * @see StyleAnimation.Animation
 * @return Animation object
 */
function StyleAnimation(elements, props, duration, callback, easing) {

	var animation = new StyleAnimation.Animation(elements, props, duration, callback, easing);
	animation.start();

	return animation;
}


/**
 * Constructor for "Animation object"s. Returned by StyleAnimation function but can
 * be called directly. Doesn't start automatically.
 * 
 * AO (animation object) will contain methods for control (like: stop() and start()).
 * 
 * 
 * Arguments:
 *  
 * 1) Elements - DOM elements which get animated. Might be single DOM element,
 * NodeList with elements or native array with elements.
 * 
 * 
 * 2) Properties with their targeted values. Properties must be provided in camelCase
 * style (e.g. marginLeft) - this might actually change in other direction quite soon ;). 
 * 
 * 
 * 3) Duration in miliseconds, defaults to StyleAnimation.defaultDuration (500) if 
 * nothing or null provided).
 * 
 * 
 * 4) Supported callbacks:
 *	- afterEach => fires after every frame animation, on each element ('this' of the callback will be that element, and current property object will be an argument)
 *	- afterAll, => called once for all animation, with 'this' set to animation object
 * AfterAll callback can be also set if providing function directly as an argument.
 * 
 * 
 * 5) Easing dictates dynamics of changes through animation. The standard is linear
 * animation, where style change progression is proportional to time progression.
 * Argument can be a function or name of built-in function (users can add 'built-in'
 * functions buy assigning to StyleAnimation.dynamics object).
 * 
 * The prototype for easing function is very simple:
 *		
 *		myfun (x) -> y
 * 
 * where provided x will be in range of (0.0, 1.0), and y usually in the same range
 * (but can expand outside if it has useful meaning with used accessors).
 * 
 * 
 * @param elements		element, array or NodeList of elements be animated
 * @param properties	map of properties and targeted values
 * @param duration		length of animation, in miliseconds [optional]
 * @param callback		callback or object with callbacks [optional]
 * @param easing		see above [optional]
 * @return Animation object
 */
StyleAnimation.Animation = function (elements, properties, duration, callback, easing) {

	// wrap into an array if not an array or NodeList
	try {
		if (!Object.prototype.toString.call(elements) === '[object Array]' || !(elements.length && elements.item)) {
			elements = [elements];
		}
	}
	catch (e) {
		elements = [elements];
	}

	this.elements = [];
	this.count = elements.length;
	this.duration = duration || StyleAnimation.defaultDuration;
	this.easing = (easing && (Object.prototype.toString.call(easing) === '[object Function]' || StyleAnimation.dynamics[easing]))
					|| StyleAnimation.dynamics.linear; // default
	
	if (callback) {
		this.afterEach = callback.afterEach || false;
		this.afterAll = callback.afterAll || callback;
	}
	else {
		this.afterEach = false;
		this.afterAll = false;
	}

	for (var i = 0, len = this.count ; i < len ; ++i) {
		var node = elements[i];
		var element = {
			node : node,
			properties : StyleAnimation.parsePropertyMap(node, properties)
		};
		
		this.propertyCount = element.properties.length;
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
			this.timer = setTimeout(callback, 16);
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
 * Parse supplied property map into internal property representation using suitable
 * accessors. Calculations are done in context of animated DOM element.
 * 
 * @param node			DOM element to be animated
 * @param properties	map of properties
 * @return internal property representation (array of property objects)
 */
StyleAnimation.parsePropertyMap = function (node, properties) {
	var props = [];
	var getRawProperty = StyleAnimation.getComputedStyle;
	
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
	
	return props;
};

/**
 * Default duration of animation, in miliseconds.
 */
StyleAnimation.defaultDuration = 500;

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


// HELPERS - for unified, cross-browser, optimized environment interaction

/**
 * Cross-browser computed style getter. Can be used freely outside SA (it's a static).
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
 * Get current timestamp with milisecond resolution.
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

