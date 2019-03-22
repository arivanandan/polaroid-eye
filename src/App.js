import React, { Component } from 'react';
import { Image, Transformation, CloudinaryContext } from 'cloudinary-react';
import FastAverageColor from 'fast-average-color/dist/index.es6';
import axios from 'axios';
import Loader from 'react-loader-spinner'
import Modal from 'react-modal';

import firebase from "./firebase";

import { getFormData } from './utils/network';

import './App.css';
import PolaroidLogo from './logo.png';

const cloudName = 'df9cadwdx';
const unsignedUploadPreset = 'dgfsqeyx';

async function fileListToDataURL(fileList) {
  // create function which return resolved promise
  // with data:base64 string
  function getDataURL(file) {
    const reader = new FileReader()
    return new Promise(resolve => {
      reader.readAsDataURL(file);
      reader.onloadend = e => { resolve({ file: reader.result, color: null, link: null }); };
    })
  }
  // here will be array of promisified functions
  const promises = []

  // loop through fileList with for loop
  for (let i = 0; i < fileList.length; i++) {
    promises.push(getDataURL(fileList[i]))
  }

  // array with base64 strings
  return await Promise.all(promises)
}

const getDecimalRange = (hex, spread = 10) => {
  const halfSpread = spread / 2;
  const colorDecimal = parseInt(hex, 16);

  let startAt = colorDecimal - spread;
  let endAt = colorDecimal + spread;
  return { startAt, endAt };

}

const fbdb = firebase.database();

class App extends Component {
  constructor(props) {
    super(props);
    this.imgRef = [];
    this.state = { colorsObtained: 0,
      loadingImages: true,
      imgSrcs: [],
      imgList: [],
      searchQuery: '',
      uploadsComplete: 0 };
  }

  componentWillMount() {
    this.getImagesFromFirebase();
  }

  onPickImage = async ({ target: { files } }) => {
    const reader = new FileReader();
    const imgSrcs = await fileListToDataURL(files);
    this.setState({ colorsObtained: 0, imgSrcs });
  }

  getImagesFromFirebase = async () => {
    const data = await fbdb.ref('images/').once('value');
    const imgListRaw = data.val();
    const imgList = Object.values(imgListRaw);
    if (imgList) this.setState({ loadingImages: false });
    this.setState({ loadingImages: false, imgList })
  }

  getImageColorsAndUpload = async (i) => {
    const fac = new FastAverageColor();
    const colorData = fac.getColor(this.imgRef[i]);
    const { error, hex } = colorData;
    const { colorsObtained: colorsObtainedOld, imgSrcs } = this.state;
    const colorsObtained = colorsObtainedOld + 1;

    const colorHex = hex.replace(/#/g, '');
    const colorDecimal = parseInt(colorHex, 16);
    imgSrcs[i].colorData = { error, colorHex, colorDecimal };
    this.setState({ colorsObtained  });

    // goes to upload after colors have been obtained for all images
    if (colorsObtained === imgSrcs.length) this.handleUpload(imgSrcs);
  }

  captureSearchQuery = ({ target: { value: searchQuery } }) => {
    if (searchQuery.length > 6) return;
    this.setState({ searchQuery });
    this.searchFor(searchQuery);
  }

  searchFor = (q) => {
    if (this.searchTimeout) clearTimeout(this.searchTimeout);
    // if (this.state.fetching && this.lastFetchToken) this.lastFetchToken.cancel();
    this.searchTimeout = setTimeout(
      () => this.setState(
        { loadingImages: true },
        async () => {
          clearTimeout(this.searchTimeout);
          const { startAt, endAt } = getDecimalRange(q);
          const data = await fbdb.ref('images/').orderByChild('colorDecimal').startAt(startAt).endAt(endAt).once('value');
          const imgListRaw = data.val();
          if (!imgListRaw) {
            this.setState({ loadingImages: false, imgErr: 'No images found', imgList: [] });
            return;
          }
          const imgList = Object.values(imgListRaw);
          this.setState({ imgList, loadingImages: false, imgErr: '' });
        },
      ),
      2000,
    );
  }

  uploadCloudinary = async (file) => {
    const url = `https://api.cloudinary.com/v1_1/${cloudName}/upload`;

    const params = { upload_preset: unsignedUploadPreset, file };
    const imgData = getFormData(params);
    const response = await axios.post(url, imgData);
    this.setState({ uploadsComplete: this.state.uploadsComplete + 1  });
    return response;
  };

  handleUpload = async (files) => {
    const urlPromiseList = [];
    for (const fileData of files) urlPromiseList.push(this.uploadCloudinary(fileData.file));
    const { imgSrcs: imgSrcsWithoutLinks } = this.state;
    const imgCDNLinks = await Promise.all(urlPromiseList)
    const imgSrcs = imgSrcsWithoutLinks.map((img, i) => {
      const link = imgCDNLinks[i].data.secure_url;
      return { ...img, link };
    });
    this.writeToFirebase(imgSrcs);
  };

  writeToFirebase = async (imgListRaw) => {
    const imgList = imgListRaw
      .map(({ file, link, colorData: { colorHex, colorDecimal } }) => ({ link, colorHex, colorDecimal }));

    const data = await fbdb.ref('images/').once('value');
    if (!data.val()) fbdb.ref('images').set(imgList);
    else imgList.forEach(img => { fbdb.ref('images/').push(img); });
  }

  openInModal = link => {
    this.setState({ selectedImage: link, isModalOpen: true });
  }

  closeModal = () => { this.setState({ isModalOpen: false }) }

  renderHeader = () => (
    <div className="header">
      <div className="header-section-logo">
        <img src={PolaroidLogo} className="logo-image" alt="Logo" />
        The Polaroid Eye
      </div>
      <div className="header-section-upload">
        <div className="button-upload">
          <input multiple type="file" onChange={this.onPickImage} />
        </div>
      </div>
    </div>
  )

  renderDOMImages = () => {
    const { imgSrcs, imgList } = this.state;

    return (
      <div>
        {imgSrcs.map(({ file, color }, i) => {
          // adds images to dom to get dimensions but doesn't render on screen
          if (color) return null;
          return (
            <img
              src={file}
              key={`tempf-${i}`}
              ref={(imgRef) => { this.imgRef[i] = imgRef }}
              onLoad={() => this.getImageColorsAndUpload(i)}
              style={{ display: 'none' }}
            />
          )
        })}
      </div>
    )
  }

  renderImage = ({ link }) => (
    <div className="container-list-image" onClick={() => this.openInModal(link)}>
      <img src={link} className="list-image" />
    </div>
  );

  renderImages = () => {
    const { loadingImages, imgList, imgErr } = this.state;
    if (loadingImages && !imgList.length) return (
      <div className="container-spinner">
        <Loader type="ThreeDots" color="#051f49" height={80} width={80} />
      </div>
    );

    return (
      <div className="container-imagelist">
        {imgErr && <div className="container-error">{imgErr}</div>}
        {imgList.map(this.renderImage)}
      </div>
    );
  }

  renderModal = () => {
    const { isModalOpen, selectedImage } = this.state;
    return (
      <Modal
          isOpen={isModalOpen}
          onRequestClose={this.closeModal}
          className ="modal-overlay"
          shouldCloseOnEsc
          // style={customStyles}
        >
          <div className="button-modal-close" onClick={this.closeModal}>
            X
          </div>
          <div className="modal-image">
            <img src={selectedImage} />
          </div>
        </Modal>
    )
  }

  renderSearchBar = () => {
    const { loadingImages, imgList } = this.state;
    return (
      <div className="stretch-center">
        <div className="container-search-bar">
          <input value="#" className="input-text input-search-hash" disabled />
          <input onChange={this.captureSearchQuery} value={this.state.searchQuery} className="input-text input-search" />
          {(loadingImages && imgList.length) ? <Loader type="Oval" color="#051f49" height={30} width={30} /> : null}
        </div>
      </div>
    );
  }

  render() {

    return (
      <div className="no-overflow">
        {this.renderHeader()}
        {this.renderDOMImages()}
        {this.renderSearchBar()}
        {this.renderImages()}
        {this.renderModal()}
      </div>
    );
  }
}

export default App;
