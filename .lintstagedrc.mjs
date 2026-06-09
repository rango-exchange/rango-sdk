import micromatch from 'micromatch';

const eslintIgnoredFiles = ['**/global-wallets-env.d.ts'];

export default {
        '*.{ts,tsx}': (files) => {
                const match = micromatch.not(files, eslintIgnoredFiles);
                return `eslint --fix --quiet ${match.join(' ')}`;
        },

        '*.{ts,tsx,json}': (files) => {
                return `prettier --write ${files.join(' ')}`;
        },
};
