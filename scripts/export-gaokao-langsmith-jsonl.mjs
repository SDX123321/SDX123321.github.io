import {
  parseArgs,
  printGraphPlan,
  runGaokaoDatasetGraph,
} from './langchain/gaokao-dataset-graph.mjs'

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.printGraphPlan) {
    printGraphPlan()
    return
  }
  const manifest = await runGaokaoDatasetGraph(options)
  console.log(JSON.stringify(manifest, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
