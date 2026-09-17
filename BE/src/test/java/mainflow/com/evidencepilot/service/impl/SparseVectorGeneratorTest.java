package com.evidencepilot.service.impl;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class SparseVectorGeneratorTest {

    private final SparseVectorGenerator generator = new SparseVectorGenerator();

    @Test
    void generate_returnsEmptyVectorForBlankText() {
        assertThat(generator.generate(" ").indices()).isEmpty();
        assertThat(generator.generate(null).values()).isEmpty();
    }

    @Test
    void generate_normalizesStopWordsAndCountsRepeatedTerms() {
        var vector = generator.generate("The control, control and evidence!");

        assertThat(vector.indices()).hasSize(2).isSorted();
        assertThat(vector.values()).containsExactlyInAnyOrder(2f, 1f);
    }
}
