import React, { Component } from 'react';
import { Image, Transformation, CloudinaryContext } from 'cloudinary-react';
import FastAverageColor from 'fast-average-color/dist/index.es6';
import axios from 'axios';
import Loader from 'react-loader-spinner'
import Modal from 'react-modal';
import { FaCheck, FaCheckCircle, FaRegCheckCircle, FaUpload } from 'react-icons/fa';
import { HuePicker } from 'react-color';
import InputRange from 'react-input-range';
import 'react-input-range/lib/css/index.css';

import firebase from "./firebase";

import { getFormData } from './utils/network';

import './App.css';
import PolaroidLogo from './logo.png';

const cloudName = 'df9cadwdx';
const unsignedUploadPreset = 'dgfsqeyx';
const maxDecimalHue = 16777215;

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
  const halfSpread = (spread / 2) * 10000;
  const colorDecimal = parseInt(hex, 16);

  let startAt = colorDecimal - halfSpread;
  let endAt = colorDecimal + halfSpread;
  return { startAt: startAt < 0 ? 0 : startAt, endAt: endAt > maxDecimalHue ? maxDecimalHue : endAt };
}

const getInitialState = () => ({ colorsObtained: 0,
  firebaseError: null,
  firebaseSuccess: 0,
  hue: '#000000',
  spread: 0,
  isImageModalOpen: false,
  isUploadModalOpen: false,
  loadingImages: true,
  imgSrcs: [],
  imgList: [],
  searchQuery: '',
  uploadsComplete: 0,
  uploadProgress: [] });

const fbdb = firebase.database();

class App extends Component {
  constructor(props) {
    super(props);
    this.imgRef = [];
    this.state = getInitialState();
  }

  componentWillMount() {
    this.getImagesFromFirebase();
  }

  onPickImage = async ({ target: { files } }) => {
    const reader = new FileReader();
    const imgSrcs = await fileListToDataURL(files);
    this.setState({ colorsObtained: 0, firebaseSuccess: 0, imgSrcs, isUploadModalOpen: true });
  }

  onCompleteFirebase = (i) => (error) => {
    const isSingleUpload = i !== undefined;
    const { firebaseSuccess, imgSrcs } = this.state;
    if (error) this.setState({ firebaseError: true });
    else this.setState({ firebaseSuccess: isSingleUpload ? firebaseSuccess + 1 : firebaseSuccess + imgSrcs.length });
    if (i) imgSrcs[i] = { ...imgSrcs[i], success: true };
    this.setState({ imgSrcs: isSingleUpload ? imgSrcs : imgSrcs.map(img => ({ ...img, success: true })) });
  }

  onUserCompleteUpload = () => {
    const { firebaseSuccess } = this.state;
    this.setState(
      { ...getInitialState(), firebaseSuccess },
      () => { setTimeout(() => { this.setState({ firebaseSuccess: 0 }) }, 5000); });
  }

  onPickSpread = (spread) => {
    this.setState({ spread });
    this.searchFor(this.state.hue.slice(1), spread);
  }

  onPickHue = ({ hex: hue }) => {
    this.setState({ hue });
    this.searchFor(hue.slice(1), this.state.spread);
  }

  getImagesFromFirebase = async () => {
    const data = await fbdb.ref('images/').once('value');
    const imgListRaw = data.val();
    const imgList = Object.values(imgListRaw);
    if (imgList) this.setState({ loadingImages: false });
    this.setState({ loadingImages: false, imgList, imgErr: '' })
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

  getUploadProgress = (index) => (progressEvent) => {
    const { uploadProgress } = this.state;
    const progress = Math.round( (progressEvent.loaded * 100) / progressEvent.total );
    console.log(index, progress);
    uploadProgress[index] = progress;
    this.setState({ uploadProgress });
  }

  captureSearchQuery = ({ target: { value: searchQuery } }) => {
    if (searchQuery.length > 6) return;
    this.setState({ searchQuery });
    this.searchFor(searchQuery);
  }

  searchFor = (hue, spread) => {
    console.log('searching for', hue, spread)
    if (this.searchTimeout) clearTimeout(this.searchTimeout);
    // if (this.state.fetching && this.lastFetchToken) this.lastFetchToken.cancel();
    this.searchTimeout = setTimeout(
      () => this.setState(
        { loadingImages: true },
        async () => {
          clearTimeout(this.searchTimeout);
          if (!hue) {
            this.getImagesFromFirebase();
            return;
          }
          const { startAt = 0, endAt = 16777215 } = getDecimalRange(hue, spread);
          console.log(startAt, endAt);
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

  uploadCloudinary = async (file, i) => {
    const url = `https://api.cloudinary.com/v1_1/${cloudName}/upload`;

    const params = { upload_preset: unsignedUploadPreset, file };
    const imgData = getFormData(params);
    const response = await axios.post(url, imgData, { onUploadProgress: this.getUploadProgress(i) });
    this.setState({ uploadsComplete: this.state.uploadsComplete + 1  });
    return response;
  };

  handleUpload = async (files) => {
    const urlPromiseList = [];
    for (const [i, fileData] of files.entries()) urlPromiseList.push(this.uploadCloudinary(fileData.file, i));
    const { imgSrcs: imgSrcsWithoutLinks } = this.state;
    const imgCDNLinks = await Promise.all(urlPromiseList)
    const imgSrcs = imgSrcsWithoutLinks.map((img, i) => {
      const link = imgCDNLinks[i].data.secure_url;
      return { ...img, link, failure: !link };
    });
    this.writeToFirebase(imgSrcs);
  };

  writeToFirebase = async (imgListRaw) => {
    const firebaseUploadData = imgListRaw
      .reduce((a, c) => {
        const { file, link, colorData: { colorHex, colorDecimal }, success, failure } = c;
        if (success || failure) return a;
        return [...a, { link, colorHex, colorDecimal }];
      }, []);

    const data = await fbdb.ref('images/').once('value');
    if (!data.val()) await fbdb.ref('images').set(firebaseUploadData, this.onCompleteFirebase());
    else await firebaseUploadData.forEach((img, i) => { fbdb.ref('images/').push(img, this.onCompleteFirebase(i)); });
  }

  openInModal = link => {
    this.setState({ selectedImage: link, isImageModalOpen: true });
  }

  closeModal = () => { this.setState({ isImageModalOpen: false }) }

  renderHeader = () => {
    const { firebaseSuccess } = this.state;
    return (
      <div className="header">
        <div className="header-section-logo">
          <img src={PolaroidLogo} className="logo-image" alt="Logo" />
          The Polaroid Eye
        </div>
        <div className="header-section-upload">
          <div className="button-upload">
            <input multiple type="file" onChange={this.onPickImage} className="input-file-upload" id="file-upload-button" />
            <label for="file-upload-button">
              {firebaseSuccess
                  ? `${firebaseSuccess} Images Uploaded`
                  : <span><FaUpload /> Upload Images</span>}
            </label>
          </div>
        </div>
      </div>
    )
  }

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

  renderImageModal = () => {
    const { isImageModalOpen, selectedImage } = this.state;
    return (
      <Modal
        isOpen={isImageModalOpen}
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

  renderHueSlider = () => {
    const { loadingImages, imgList, hue, spread } = this.state;
    return (
      <div className="flex-column stretch-center">
        <div className="container-search-bar">
          <HuePicker
            color={hue}
            onChangeComplete={this.onPickHue}
          />
          <div className="color-picked-hue" style={{ backgroundColor: hue }} />
          {loadingImages ? <Loader type="Oval" color="#051f49" height={30} width={30} /> : null}
        </div>
      </div>
    );
  }

  renderSpreadSlider = () => {
    const { spread } = this.state;
    return (
      <div className="container-spread-slider">
        <InputRange
          maxValue={100}
          minValue={0}
          value={spread}
          onChange={this.onPickSpread}
        />
      </div>
    )
  }

  renderUploadModal = () => {
    const { imgSrcs, isUploadModalOpen, firebaseSuccess, firebaseError, uploadProgress } = this.state;
    const uploadStatusMessage = `${firebaseSuccess}/${imgSrcs.length}`;
    return (
      <Modal
        isOpen={isUploadModalOpen}
        onRequestClose={this.closeModal}
        className ="modal-overlay"
      >
        <div className="modal-upload">
          <div className="container-title-upload-modal flex-row justify-sb align-center">
            <span className="text-upload-title">Upload</span>
            <span>{uploadStatusMessage}</span>
          </div>
          <div className="container-upload-progress-list">
            {uploadProgress.map((p, i) => {
              const isComplete = p === 100;
              return (
                <div className="container-upload-progress flex-row align-center" key={`progress-${i}`}>
                  <img src={imgSrcs.length ? imgSrcs[i].file : ''} className="image-upload-progress" />
                  <div className="container-upload-bar-progress">
                    <div className="upload-progress-bar" style={{ width: `${p}%`, backgroundColor: isComplete ? 'green' : 'blue' }} />
                  </div>
                  <div className="container-progress-modal-loader">
                    {isComplete ? <FaCheckCircle color="green" /> : <Loader type="Oval" color="#051f49" height={15} width={15} />}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="container-upload-firebase flex justify-center">
            {(() => {
              if (firebaseError) return firebaseError;
              if (firebaseSuccess) return (
                <div>
                  <span>{`${uploadStatusMessage} images uploaded`}</span><FaCheck color="green" />
                </div>
              );
              return null;
            })()}
          </div>
          <div className="flex justify-center">
            <button onClick={this.onUserCompleteUpload} className="button-upload-done" disabled={firebaseSuccess || firebaseError}>
              Ok, Done!
            </button>
          </div>
        </div>
      </Modal>
    )
  }

  render() {

    return (
      <div className="no-overflow">
        {this.renderHeader()}
        {this.renderDOMImages()}
        {this.renderHueSlider()}
        {this.renderSpreadSlider()}
        {this.renderImages()}
        {this.renderImageModal()}
        {this.renderUploadModal()}
      </div>
    );
  }
}

export default App;
