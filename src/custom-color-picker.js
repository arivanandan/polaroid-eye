import React from 'react'
import PropTypes from 'prop-types';
import { ChromePicker } from 'react-color'

export default class CustomColorPicker extends React.Component {
  static propTypes = {
    closePicker: PropTypes.bool,
    color: PropTypes.string.isRequired,
    onChange: PropTypes.func.isRequired,
  }

  static defaultProps = {
    closePicker: false,
  }

  state = { displayColorPicker: false };

  handleClick = () => {
    this.setState({ displayColorPicker: !this.state.displayColorPicker })
  };

  handleClose = () => {
    this.setState({ displayColorPicker: false })
  };

  render() {
    const { closePicker, color, onChange } = this.props;
    const { displayColorPicker } = this.state;

    return (
      <React.Fragment>
        <div className="container-color-picker-swatch" onClick={ this.handleClick }>
          <div className="container-color-picker" style={{ backgroundColor: color }} />
        </div>
        {(displayColorPicker && !closePicker) ? (
          <div className="container-color-picker-popover">
            <div className="container-color-picker-cover" onClick={ this.handleClose }/>
            <ChromePicker color={color} onChange={onChange} />
          </div>
        ) : null }
      </React.Fragment>
    )
  }
}
