export function capitalizeFirstLetter(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function formatArrayProgress(arrayIndex: string | number, arrayLength: number) {
  const currentIndex = typeof arrayIndex === 'string' ? parseInt(arrayIndex, 10) : arrayIndex;

  return `(${currentIndex + 1}/${arrayLength})`;
}
