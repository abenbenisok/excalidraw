import { mutateElement } from "./element/mutateElement";
import { ExcalidrawElement } from "./element/types";
import {
  generateKeyBetween as _generateKeyBetween,
  generateJitteredKeyBetween as _generateJitteredKeyBetween,
  generateNKeysBetween as _generateNKeysBetween,
  generateNJitteredKeysBetween as _generateNJitteredKeysBetween,
  base62CharSet as _base62CharSet,
  indexCharacterSet,
} from "fractional-indexing-jittered";
import { ENV } from "./constants";
import { Mutable } from "./utility-types";

type FractionalIndex = ExcalidrawElement["fractionalIndex"];

const base36CharSet = indexCharacterSet({
  chars: "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  firstPositive: "A",
  mostPositive: "Z",
});

const { chars, firstPositive, mostPositive, mostNegative } = _base62CharSet();

const base62CharSet = indexCharacterSet({
  chars,
  firstPositive,
  mostPositive,
  mostNegative,
  jitterRange: 6,
});

const charSet =
  import.meta.env.DEV || import.meta.env.MODE === ENV.TEST
    ? base36CharSet
    : base62CharSet;

export const generateKeyBetween = (
  lower: string | null,
  upper: string | null,
) => _generateKeyBetween(lower, upper, charSet);

export const generateJitteredKeyBetween = (
  lower: string | null,
  upper: string | null,
) => _generateJitteredKeyBetween(lower, upper, charSet);

export const generateNKeysBetween = (
  lower: string | null,
  upper: string | null,
  n: number,
) => _generateNKeysBetween(lower, upper, n, charSet);

export const generateNJitteredKeysBetween = (
  lower: string | null,
  upper: string | null,
  n: number,
) => _generateNJitteredKeysBetween(lower, upper, n, charSet);

export const orderByFractionalIndex = (allElements: ExcalidrawElement[]) => {
  return allElements.sort((a, b) => {
    if (a.fractionalIndex && b.fractionalIndex) {
      if (a.fractionalIndex < b.fractionalIndex) {
        return -1;
      } else if (a.fractionalIndex > b.fractionalIndex) {
        return 1;
      }
      return compareStrings(a.id, b.id);
    }

    // respect the order of the array
    return 1;
  });
};

export const validateFractionalIndices = (
  elements: readonly ExcalidrawElement[],
) => {
  for (let i = 0; i < elements.length; i++) {
    const element = elements[i];
    const successor = elements[i + 1];

    if (element.fractionalIndex) {
      if (
        successor &&
        successor.fractionalIndex &&
        element.fractionalIndex >= successor.fractionalIndex
      ) {
        return false;
      }
    } else {
      return false;
    }
  }

  return true;
};

/**
 * Fix fractional indices by mutating element of @param elements, which were passed inside @param reorderedElements.
 *
 * As opposed to @function restoreFractionalIndices, this one does not alter neighboring indices.
 */
export const fixFractionalIndices = (
  elements: readonly ExcalidrawElement[],
  reorderedElements: Map<string, ExcalidrawElement>,
) => {
  const contiguousMovedIndices = getContiguousMovedIndices(
    elements,
    reorderedElements,
  );

  const generateFn =
    import.meta.env.MODE === ENV.TEST
      ? generateNKeysBetween
      : generateNJitteredKeysBetween;

  for (const movedIndices of contiguousMovedIndices) {
    try {
      const predecessor =
        elements[movedIndices[0] - 1]?.fractionalIndex || null;
      const successor =
        elements[movedIndices[movedIndices.length - 1] + 1]?.fractionalIndex ||
        null;

      const newKeys = generateFn(predecessor, successor, movedIndices.length);

      for (let i = 0; i < movedIndices.length; i++) {
        const element = elements[movedIndices[i]];

        mutateElement(
          element,
          {
            fractionalIndex: newKeys[i],
          },
          false,
        );
      }
    } catch (e) {
      console.error("error fixing fractional indices", e);
    }
  }

  return elements as ExcalidrawElement[];
};

/**
 * Restore the fractional indices by mutating @param elements such that
 * every element in the array has a fractional index smaller than its successor's.
 *
 * Neighboring indices (altough correct) might get updated as well.
 *
 * Only use this function when restoring or as a fallback to guarantee fractional
 * indices consistency.
 */
export const restoreFractionalIndices = (
  elements: readonly ExcalidrawElement[],
) => {
  for (const [index, element] of elements.entries()) {
    const predecessor = elements[index - 1]?.fractionalIndex || null;
    const successor = elements[index + 1]?.fractionalIndex || null;

    if (
      !isValidFractionalIndex(element.fractionalIndex, predecessor, successor)
    ) {
      try {
        const fractionalIndex = restoreFractionalIndex(predecessor, successor);
        // Mutate in situ, without modifying version, versionNonce and etc.
        (element as Mutable<ExcalidrawElement>).fractionalIndex =
          fractionalIndex;
      } catch (e) {
        console.error(e);
      }
    }
  }

  return elements as ExcalidrawElement[];
};

const getContiguousMovedIndices = (
  elements: readonly ExcalidrawElement[],
  movedElementsMap: Map<string, ExcalidrawElement>,
) => {
  const result: number[][] = [];
  const contiguous: number[] = [];

  for (let i = 0; i < elements.length; i++) {
    const element = elements[i];
    if (movedElementsMap.has(element.id)) {
      if (contiguous.length) {
        if (contiguous[contiguous.length - 1] + 1 === i) {
          contiguous.push(i);
        } else {
          result.push(contiguous.slice());
          contiguous.length = 0;
          contiguous.push(i);
        }
      } else {
        contiguous.push(i);
      }
    }
  }

  if (contiguous.length > 0) {
    result.push(contiguous.slice());
  }

  return result;
};

const compareStrings = (a: string, b: string) => {
  return a < b ? -1 : 1;
};

const restoreFractionalIndex = (
  predecessor: FractionalIndex,
  successor: FractionalIndex,
) => {
  const generateFn =
    import.meta.env.MODE === ENV.TEST
      ? generateKeyBetween
      : generateJitteredKeyBetween;

  if (successor && !predecessor) {
    // first element in the array
    // insert before successor
    return generateFn(null, successor);
  }

  if (predecessor && !successor) {
    // last element in the array
    // insert after predecessor
    return generateFn(predecessor, null);
  }

  // both predecessor and successor exist (or both do not)
  // insert after predecessor
  return generateFn(predecessor, null);
};

const isValidFractionalIndex = (
  index: FractionalIndex,
  predecessor: FractionalIndex,
  successor: FractionalIndex,
) => {
  if (index) {
    if (predecessor && successor) {
      return predecessor < index && index < successor;
    }

    if (successor && !predecessor) {
      // first element
      return index < successor;
    }

    if (predecessor && !successor) {
      // last element
      return predecessor < index;
    }

    if (!predecessor && !successor) {
      return index.length > 0;
    }
  }

  return false;
};