// Shared Preview-mapping fixtures: every offset is hand-computed from the
// string above it — recompute by counting, never by running indexOf.
export const mdSample = 'Alpha **comparisons** beta $x^2$ gamma.';
// A0-4 sp5 *6*7 c8-18 *19*20 sp21 b22-25 sp26 $27 x28 ^29 2(30) $31 sp32 g33-37 .38
export const mdSampleBold = { from: 6, to: 21 };
export const mdSampleMath = { from: 27, to: 32 };

export const texSample = 'Alpha \\textbf{comparisons} beta \\cite{key} gamma.';
// 'Alpha '0-5 \6-12 {13 c14-24 }25 sp26 b27-30 sp31 \32 cite33-36 {37 key38-40 }41
export const texSampleTextbf = { from: 6, to: 26 };
export const texSampleCite = { from: 32, to: 42 };

export const texFish = 'A \\textbf{fish} is different from another \\textbf{fish}.';
export const texFishFirst = { from: 2, to: 15 };
export const texFishSecond = { from: 42, to: 55 };
