#!/usr/bin/env node
/**
 * Load a .3DS file through Three.js TDSLoader (headless, in Node) and report
 * the bounding box dimensions raw + under each plausible up-axis correction.
 * Used to diagnose orientation bugs when a user reports a model looking tipped.
 */
import fs from 'node:fs'
import path from 'node:path'
import * as THREE from 'three'
import { TDSLoader } from 'three/examples/jsm/loaders/TDSLoader.js'

const file = process.argv[2]
if (!file) {
	console.error('usage: node scripts/inspect-3ds.mjs <path.3DS>')
	process.exit(1)
}
const abs = path.resolve(file)
const bytes = fs.readFileSync(abs)
const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)

const loader = new TDSLoader()
const group = loader.parse(buf)

function bbox(obj) {
	const box = new THREE.Box3().setFromObject(obj)
	const size = new THREE.Vector3()
	box.getSize(size)
	return { x: +size.x.toFixed(2), y: +size.y.toFixed(2), z: +size.z.toFixed(2) }
}

const raw = bbox(group)

const xRot = group.clone(true)
xRot.rotation.x = -Math.PI / 2
xRot.updateMatrixWorld(true)
const afterXRot = bbox(xRot)

const zRot = group.clone(true)
zRot.rotation.z = -Math.PI / 2
zRot.updateMatrixWorld(true)
const afterZRot = bbox(zRot)

console.log('file              :', abs)
console.log('mesh count        :', group.children.length)
console.log('raw (no rotation) :', raw)
console.log('after rotation.x  :', afterXRot, '(= current 3DS loader behavior when heuristic triggers)')
console.log('after rotation.z  :', afterZRot)
