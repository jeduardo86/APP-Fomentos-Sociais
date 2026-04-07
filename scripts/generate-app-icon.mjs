import { readFile, writeFile } from 'node:fs/promises'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const svgPath = new URL('../public/app-icon-heart.svg', import.meta.url)
const png192Path = new URL('../public/app-icon-heart-192.png', import.meta.url)
const png256Path = new URL('../public/app-icon-heart-256.png', import.meta.url)
const png512Path = new URL('../public/app-icon-heart-512.png', import.meta.url)
const icoPath = new URL('../public/app-icon-heart.ico', import.meta.url)

async function renderPng(svgBuffer, size) {
  return sharp(svgBuffer).resize(size, size, { fit: 'contain' }).png({ compressionLevel: 9 }).toBuffer()
}

async function main() {
  const svgBuffer = await readFile(svgPath)

  const png192Buffer = await renderPng(svgBuffer, 192)
  const png256Buffer = await renderPng(svgBuffer, 256)
  const png512Buffer = await renderPng(svgBuffer, 512)

  await writeFile(png192Path, png192Buffer)
  await writeFile(png256Path, png256Buffer)
  await writeFile(png512Path, png512Buffer)

  const icoBuffer = await pngToIco(png256Buffer)
  await writeFile(icoPath, icoBuffer)

  console.log('Icones gerados com sucesso:')
  console.log('- public/app-icon-heart-192.png')
  console.log('- public/app-icon-heart-256.png')
  console.log('- public/app-icon-heart-512.png')
  console.log('- public/app-icon-heart.ico')
}

main().catch((error) => {
  console.error('Falha ao gerar icones:', error)
  process.exitCode = 1
})
