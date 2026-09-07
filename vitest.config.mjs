import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		// File integration berbagi satu DB MariaDB — paralelisme antar-file
		// memicu deadlock pada lock baris Location/ItemMutation.
		fileParallelism: false,
	},
});
