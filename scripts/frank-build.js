const fse = require('fs-extra')
const path = require('path')

const pckPath = process.cwd()
const destPath = path.join(pckPath, './lib')

async function includeFileInBuild(file) {
  const sourcePath = path.resolve(pckPath, file)
  const targetPath = path.resolve(destPath, path.basename(file))
  if (fse.existsSync(sourcePath)) {
    await fse.copy(sourcePath, targetPath)
  }
  console.log(`Copied ${sourcePath} to ${targetPath}`)
}

async function createPackageFile() {
  const packageData = await fse.readFile(
    path.resolve(pckPath, './package.json'),
    'utf8'
  )
  const { scripts, devDependencies, workspaces, files, ...packageDataOther } =
    JSON.parse(packageData)

  const newPackageData = {
    ...packageDataOther,
    private: false,
    ...(packageDataOther.main
      ? {
          main: './cjs/index.js',
          module: './index.js',
          types: './index.d.ts',
        }
      : {}),
  }

  const targetPath = path.resolve(destPath, './package.json')

  await fse.writeFile(
    targetPath,
    JSON.stringify(newPackageData, null, 2),
    'utf8'
  )
  console.log(`Created package.json in ${targetPath}.`)

  return newPackageData
}

async function run() {
  try {
    await createPackageFile()
    await Promise.all(
      ['../../README.md', '../../LICENSE'].map((file) =>
        includeFileInBuild(file)
      )
    )
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}

run()
