/*
	compiles a selector to an executable function
*/

module.exports = compile;
module.exports.compileUnsafe = compileUnsafe;

var parse       = require("CSSwhat"),
    DomUtils    = require("domutils"),
    isTag       = DomUtils.isTag,
    Rules       = require("./general.js"),
    sortRules   = require("./sort.js"),
    BaseFuncs   = require("boolbase"),
    trueFunc    = BaseFuncs.trueFunc,
    falseFunc   = BaseFuncs.falseFunc,
    procedure   = require("./procedure.json");

function compile(selector, options){
	var next = compileUnsafe(selector, options);
	return wrap(next);
}

function wrap(next){
	return function base(elem){
		return isTag(elem) && next(elem);
	};
}

function compileUnsafe(selector, options){
	var token = parse(selector, options);
	return compileToken(token, options);
}

function compileToken(token, options){
	token.forEach(sortRules);

	if(options && options.context){
		var ctx = options.context;

		token.forEach(function(t){
			if(!isTraversal(t[0])){
				t.unshift({type: "descendant"});
			}
		});

		var context = Array.isArray(ctx) ?
			function(elem){
				return ctx.indexOf(elem) >= 0;
			} : function(elem){
				return ctx === elem;
			};

		if(options.rootFunc){
			var root = options.rootFunc;

			options.rootFunc = function(elem){
				return context(elem) && root(elem);
			};
		} else {
			options.rootFunc = context;
		}
	}

	return token
		.map(compileRules, options)
		.reduce(reduceRules, falseFunc);
}

function isTraversal(t){
	return procedure[t.type] < 0;
}

function compileRules(rules){
	if(rules.length === 0) return falseFunc;

	var options = this;

	return rules.reduce(function(func, rule){
		if(func === falseFunc) return func;
		return Rules[rule.type](func, rule, options);
	}, options && options.rootFunc || trueFunc);
}

function reduceRules(a, b){
	if(b === falseFunc || a === trueFunc){
		return a;
	}
	if(a === falseFunc || b === trueFunc){
		return b;
	}

	return function combine(elem){
		return a(elem) || b(elem);
	};
}

//:not and :has have to compile selectors
//doing this in lib/pseudos.js would lead to circular dependencies,
//so we add them here

var Pseudos     = require("./pseudos.js"),
    filters     = Pseudos.filters,
    existsOne   = DomUtils.existsOne,
    isTag       = DomUtils.isTag,
    getChildren = DomUtils.getChildren;


function containsTraversal(t){
	return t.some(isTraversal);
}

filters.not = function(next, select, options){
	var opts = options ? {xmlMode: !!options.xmlMode, strict: !!options.strict} : null,
	    func;

	if(options && options.strict){
		var tokens = parse(select);
		if(tokens.length > 1 || tokens.some(containsTraversal)){
			throw new SyntaxError("complex selectors in :not aren't allowed in strict mode");
		}

		func = compileToken(tokens, options);
	} else {
		func = compileUnsafe(select, opts);
	}

	if(func === falseFunc) return next;
	if(func === trueFunc)  return falseFunc;

	return function(elem){
		return !func(elem) && next(elem);
	};
};

filters.has = function(next, selector, options){
	//TODO add a dynamic context in front of every selector with a traversal
	//:has will never be reached with options.strict == true
	var opts = options ? {xmlMode: !!options.xmlMode, strict: false} : null;
	var func = compileUnsafe(selector, opts);

	if(func === falseFunc) return falseFunc;
	if(func === trueFunc)  return function(elem){
			return getChildren(elem).some(isTag) && next(elem);
		};

	func = wrap(func);

	return function has(elem){
		return next(elem) && existsOne(func, getChildren(elem));
	};
};
