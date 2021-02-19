'use strict';

const utils = require('../src/utils');

describe('Unit Tests', () => {
  describe('utils tests', () => {
    test('inputs config with no dist folder defaults to root directory', () => {
      const inputs = {
        src: './',
      };
      expect(utils.getAppDirectory(inputs)).toEqual('./');
    });

    test('inputs config with dist folder uses that as the app directory', () => {
      const inputs = {
        src: './',
        dist: './dist',
      };
      expect(utils.getAppDirectory(inputs)).toEqual('./dist');
    });
  });
});
