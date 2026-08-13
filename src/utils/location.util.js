/**
 * Format lokasi untuk tampilan: "Rak - Shelf" jika punya parent, else nama lokasi saja.
 */
export function formatLocationDisplay(location, fallbackName = null) {
    if (fallbackName && String(fallbackName).includes(' - ')) {
        return fallbackName;
    }

    if (!location) {
        return fallbackName || null;
    }

    if (location.parent) {
        return `${location.parent.name} - ${location.name}`;
    }

    return location.name;
}

export async function resolveLocationDisplay(tx, locationId, fallbackName = null) {
    if (!locationId) return fallbackName || null;

    const location = await tx.location.findUnique({
        where: { id: locationId },
        include: { parent: true }
    });

    return formatLocationDisplay(location, fallbackName);
}
