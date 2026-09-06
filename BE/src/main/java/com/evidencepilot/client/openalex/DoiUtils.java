package com.evidencepilot.client.openalex;

import java.util.regex.Pattern;

public final class DoiUtils {

    private static final Pattern DOI_PATTERN = Pattern.compile("^10\\.\\d{4,9}/[-._;()/:A-Za-z0-9]+$");

    private DoiUtils() {}

    public static String normalize(String doi) {
        if (doi == null || doi.isBlank()) {
            return null;
        }
        String normalized = doi.trim();
        if (normalized.startsWith("https://doi.org/")) {
            normalized = normalized.substring("https://doi.org/".length());
        } else if (normalized.startsWith("http://doi.org/")) {
            normalized = normalized.substring("http://doi.org/".length());
        } else if (normalized.startsWith("doi:")) {
            normalized = normalized.substring("doi:".length());
        } else if (normalized.startsWith("DOI:")) {
            normalized = normalized.substring("DOI:".length());
        }
        normalized = normalized.trim();
        while (normalized.startsWith("/")) {
            normalized = normalized.substring(1);
        }
        return normalized;
    }

    public static String comparisonKey(String doi) {
        String normalized = normalize(doi == null ? null : doi.toLowerCase(java.util.Locale.ROOT));
        return isValid(normalized) ? normalized : null;
    }

    public static String toOpenAlexId(String doi) {
        String normalized = normalize(doi);
        if (normalized == null) return null;
        return "doi:" + normalized;
    }

    public static boolean isValid(String doi) {
        String normalized = normalize(doi);
        return normalized != null && DOI_PATTERN.matcher(normalized).matches();
    }
}
