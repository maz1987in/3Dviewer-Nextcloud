#!/usr/bin/env node
import { promises as fs } from 'fs'
import path from 'path'

const root = process.cwd()

/**
 * Copy file type icons from img/filetypes/ to img/
 * This ensures Nextcloud can find them for file type display
 */
async function copyIcons() {
  const sourceDir = path.resolve(root, 'img', 'filetypes')
  const targetDir = path.resolve(root, 'img')

  try {
    const files = await fs.readdir(sourceDir)
    const svgFiles = files.filter(f => f.endsWith('.svg'))

    console.log('[copy-icons] Copying file type icons...')

    for (const file of svgFiles) {
      const sourcePath = path.join(sourceDir, file)
      const targetPath = path.join(targetDir, file)

      await fs.copyFile(sourcePath, targetPath)
      console.log(`[copy-icons] ${file}: copied`)
    }

    console.log(`[copy-icons] Successfully copied ${svgFiles.length} icons`)
  } catch (error) {
    console.error('[copy-icons] Error copying icons:', error.message)
    process.exit(1)
  }
}

copyIcons()

