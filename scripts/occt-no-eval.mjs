/**
 * Build-time rewrite that lets the OCCT runtime run without `unsafe-eval`.
 *
 * `occt-import-js` is compiled with emscripten's default `DYNAMIC_EXECUTION=1`, so its
 * embind glue generates the JavaScript caller for every C++ binding as source text and
 * compiles it with `new Function`. Nextcloud's Content Security Policy forbids that, and
 * from Nextcloud 34 an app cannot opt back in (`allowEvalScript()` is gone), so STEP,
 * IGES, BREP and FCSTD failed with `EvalError: call to Function() blocked by CSP` (#169).
 *
 * Upstream publishes no `DYNAMIC_EXECUTION=0` build, and producing one means compiling
 * OpenCascade. The glue has exactly two eval sites, though, and emscripten itself ships
 * closure-based equivalents of both for `DYNAMIC_EXECUTION=0`. This swaps those in. The
 * wasm binary is untouched: both sites are pure JavaScript marshalling.
 *
 * Each replacement matches the published text exactly and throws when it is not there.
 * A version of the dependency that reshapes its glue therefore fails the build instead
 * of shipping CAD loaders that break only in a browser under a strict CSP.
 */

/**
 * `craftInvokerFunction`: the caller for a bound C++ function (`ReadStepFile` etc.).
 *
 * Mirrors the generated body statement for statement. In particular `destructors` stays
 * `null` unless a destructor stack is needed: `toWireType` registers a free on a non-null
 * stack, and the per-argument `destructorFunction` below frees the same pointer, so
 * passing a stack in both cases would free twice.
 */
const INVOKER = {
	find: 'let[args,invokerFnBody]=createJsInvoker(argTypes,isClassMethodFunc,returns,isAsync);args.push(invokerFnBody);var invokerFn=newFunc(Function,args)(...closureArgs);',
	replace: 'var invokerFn=function(...args){'
		+ 'var destructors=needsDestructorStack?[]:null;'
		+ 'var thisWired;'
		+ 'var argsWired=[];'
		+ 'if(isClassMethodFunc){thisWired=argTypes[1]["toWireType"](destructors,this)}'
		+ 'for(var i=0;i<argCount-2;++i){argsWired.push(argTypes[i+2]["toWireType"](destructors,args[i]))}'
		+ 'var rv=isClassMethodFunc?cppInvokerFunc(cppTargetFunc,thisWired,...argsWired):cppInvokerFunc(cppTargetFunc,...argsWired);'
		+ 'if(needsDestructorStack){runDestructors(destructors)}'
		+ 'else{for(var i=isClassMethodFunc?1:2;i<argTypes.length;++i){'
		+ 'if(argTypes[i].destructorFunction!==null){argTypes[i].destructorFunction(i===1?thisWired:argsWired[i-2])}}}'
		+ 'if(returns){return argTypes[0]["fromWireType"](rv)}'
		+ '};',
}

/**
 * `__emval_get_method_caller`: the caller C++ uses to invoke a JavaScript function, e.g.
 * while reading the import params object. `kind` 0 calls `func` on `obj`, 1 constructs,
 * and anything else takes `this` from the first argument — the same three shapes the
 * generated text had.
 */
const METHOD_CALLER = {
	find: /var functionBody=`return function \(obj, func, destructorsRef, args\) \{\\n`;.*?var invokerFunction=newFunc\(Function,params\)\(\.\.\.args\);/s,
	replace: 'var invokerFunction=(obj,func,destructorsRef,args)=>{'
		+ 'var argN=[];'
		+ 'var offset=0;'
		+ 'for(var i=0;i<argCount;++i){argN.push(types[i].readValueFromPointer(args+offset));offset+=types[i].argPackAdvance}'
		+ 'var rv=kind===1?Reflect.construct(func,argN):kind===0?func.apply(obj,argN):func.call(...argN);'
		+ 'if(!retType.isVoid){return emval_returnValue(retType,destructorsRef,rv)}'
		+ '};',
}

/**
 * Replace the glue's two `new Function` sites with closures.
 *
 * @param {string} code - Source of `occt-import-js/dist/occt-import-js.js`
 * @return {string} the same glue, free of dynamic code generation
 * @throws {Error} when either site is missing, or one survives the rewrite
 */
export function stripDynamicExecution(code) {
	let out = code
	for (const { find, replace } of [INVOKER, METHOD_CALLER]) {
		const next = out.replace(find, () => replace)
		if (next === out) {
			throw new Error(
				'occt-no-eval: the occt-import-js glue no longer contains an eval site this rewrite '
				+ 'expects. The dependency changed shape; update scripts/occt-no-eval.mjs against '
				+ 'the new glue before building, or the CAD loaders will fail under Nextcloud\'s CSP.',
			)
		}
		out = next
	}
	if (/newFunc\(Function\b/.test(out)) {
		throw new Error('occt-no-eval: the occt-import-js glue still compiles a function from text after the rewrite.')
	}
	return out
}

/**
 * Vite plugin applying {@link stripDynamicExecution} to the glue as it is bundled.
 *
 * @return {import('vite').Plugin}
 */
export function occtNoEval() {
	let applied = false
	return {
		name: 'threedviewer:occt-no-eval',
		enforce: 'pre',
		buildStart() {
			applied = false
		},
		// Matching on a path can stop matching — the package moves its entry point, or a
		// bundler change alters the id — and a rewrite that silently never runs ships
		// exactly the bug it exists to prevent, behind a green build.
		buildEnd(error) {
			if (!error && !applied) {
				throw new Error('occt-no-eval: the occt-import-js glue was never seen during the build, so it was not rewritten.')
			}
		},
		transform(code, id) {
			// The id must end at `.js`: the CommonJS plugin also emits proxy modules under
			// the same path with a `?commonjs-…` query, and those hold no glue.
			if (!/[\\/]occt-import-js[\\/]dist[\\/]occt-import-js\.js$/.test(id)) {
				return null
			}
			applied = true
			return { code: stripDynamicExecution(code), map: null }
		},
	}
}
