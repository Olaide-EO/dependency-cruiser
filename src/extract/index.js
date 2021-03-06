const _uniqBy = require("lodash/uniqBy");
const _spread = require("lodash/spread");
const _concat = require("lodash/concat");
const pathToPosix = require("../utl/path-to-posix");
const getDependencies = require("./get-dependencies");
const gatherInitialSources = require("./gather-initial-sources");
const clearCaches = require("./clear-caches");

/* eslint max-params:0 */
function extractRecursive(
  pFileName,
  pOptions,
  pVisited,
  pDepth,
  pResolveOptions,
  pTSConfig
) {
  pVisited.add(pFileName);
  const lDependencies =
    pOptions.maxDepth <= 0 || pDepth < pOptions.maxDepth
      ? getDependencies(pFileName, pOptions, pResolveOptions, pTSConfig)
      : [];

  return lDependencies
    .filter(
      (pDependency) => pDependency.followable && !pDependency.matchesDoNotFollow
    )
    .reduce(
      (pAll, pDependency) => {
        if (!pVisited.has(pDependency.resolved)) {
          return pAll.concat(
            extractRecursive(
              pDependency.resolved,
              pOptions,
              pVisited,
              pDepth + 1,
              pResolveOptions,
              pTSConfig
            )
          );
        }
        return pAll;
      },
      [
        {
          source: pathToPosix(pFileName),
          dependencies: lDependencies,
        },
      ]
    );
}

function extractFileDirectoryArray(
  pFileDirectoryArray,
  pOptions,
  pResolveOptions,
  pTSConfig
) {
  let lVisited = new Set();

  return _spread(_concat)(
    gatherInitialSources(pFileDirectoryArray, pOptions).reduce(
      (pDependencies, pFilename) => {
        if (!lVisited.has(pFilename)) {
          lVisited.add(pFilename);
          return pDependencies.concat(
            extractRecursive(
              pFilename,
              pOptions,
              lVisited,
              0,
              pResolveOptions,
              pTSConfig
            )
          );
        }
        return pDependencies;
      },
      []
    )
  );
}

function isNotFollowable(pToDependency) {
  return !pToDependency.followable;
}

function notInFromListAlready(pFromList) {
  return (pToListItem) =>
    !pFromList.some(
      (pFromListItem) => pFromListItem.source === pToListItem.resolved
    );
}

function toDependencyToSource(pToListItem) {
  return {
    source: pToListItem.resolved,
    followable: pToListItem.followable,
    coreModule: pToListItem.coreModule,
    couldNotResolve: pToListItem.couldNotResolve,
    matchesDoNotFollow: pToListItem.matchesDoNotFollow,
    dependencyTypes: pToListItem.dependencyTypes,
    dependencies: [],
  };
}

function complete(pAll, pFromListItem) {
  return pAll
    .concat(pFromListItem)
    .concat(
      pFromListItem.dependencies
        .filter(isNotFollowable)
        .filter(notInFromListAlready(pAll))
        .map(toDependencyToSource)
    );
}

function filterExcludedDynamicDependencies(pModule, pExclude) {
  // no need to do the 'path' thing as that was addressed in extractFileDirectoryArray already
  return {
    ...pModule,
    dependencies: pModule.dependencies.filter(
      (pDependency) =>
        !Object.prototype.hasOwnProperty.call(pExclude, "dynamic") ||
        pExclude.dynamic !== pDependency.dynamic
    ),
  };
}

module.exports = (
  pFileDirectoryArray,
  pOptions,
  pResolveOptions,
  pTSConfig
) => {
  clearCaches();

  return _uniqBy(
    extractFileDirectoryArray(
      pFileDirectoryArray,
      pOptions,
      pResolveOptions,
      pTSConfig
    ).reduce(complete, []),
    (pModule) => pModule.source
  ).map((pModule) =>
    filterExcludedDynamicDependencies(pModule, pOptions.exclude)
  );
};
