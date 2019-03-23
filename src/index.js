import React from 'react';
import ReactDOM from 'react-dom';
import { CloudinaryContext } from 'cloudinary-react';

import './index.css';
import App from './App';
import * as serviceWorker from './serviceWorker';

const RootNode = (
  <CloudinaryContext cloudName={process.env.REACT_APP_CLOUDINARY_CLOUD_NAME}>
      <App />
  </CloudinaryContext>
);

ReactDOM.render(RootNode, document.getElementById('root'));

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
serviceWorker.unregister();
