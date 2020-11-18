'use strict';

const path = require('path');

module.exports = {
  mode: 'production',
  entry: './src/app.ts',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  target: 'node',
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  output: {
    filename: 'app.js',
    libraryTarget: 'commonjs-module',
    path: path.resolve(__dirname, 'build'),
  },
};
