import React, { Fragment, useState } from 'react';
import Message from './Message';
import Progress from './Progress';
import axios from 'axios';

const FileUpload = () => {
  const [file, setFile] = useState([]);
  const [filename, setFilename] = useState('Choose File');
  const [message, setMessage] = useState('');
  const [uploadPercentage, setUploadPercentage] = useState(0);
  const [dataFiles, setDataFiles] = useState([]);


  const onChange = e => {
    console.log(e.target.files);
    const mfil = Array.from(e.target.files);

    setFile(mfil);
    const names =mfil.length +  " files selected.";

    setFilename(names);
  };

  const onSubmit = async e => {
    e.preventDefault();
   // setDataFiles(file);

    file.forEach((datafile)=>{
      uploadOneByOne(datafile);
    })
  }


  const uploadOneByOne = async dataFile => {

    const formData = new FormData();
    
    // append file in 'file1' which is used in backend multer config
    formData.append('file1', dataFile);
    //setFiles(files.push(file));
    
    try {
      // send an asynchrnous post request for file upload
      axios.post('http://localhost:5000/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
      });

      // create eventsource to listen for uploadProgress server sent event (SSE)
      const eventSource = new EventSource('http://localhost:5000/upload');

      // add event listener for upload progress
      eventSource.addEventListener('uploadProgress', (e) => {

        // close the event source connection if file has uploaded
        if (parseInt(e.data) === 100) {
          console.log(`clearing connection ${e.data}`);
          eventSource.close();
        }

        console.log(`progress ${e.data}`);
        
        // set progress bar upload status
        setUploadPercentage(parseInt(e.data));
      });

      // error handling for event source
      eventSource.onerror = (err) => {
        console.error("EventSource failed:", err);
      };

      setMessage('File Uploaded');
    } catch (err) {
      if (err.response.status === 500) {
        setMessage('There was a problem with the server');
      } else {
        setMessage(err.response.data.msg);
      }
    }
  };

  return (
    <Fragment>
      {message ? <Message msg={message} /> : null}
      <form onSubmit={onSubmit}>
        <div className='custom-file mb-4'>
          <input
            type='file'
            className='custom-file-input'
            id='customFile'
            multiple
            onChange={onChange}
          />
          <label className='custom-file-label' htmlFor='customFile'>
            {filename}
          </label>
        </div>

        

        <input
          type='submit'
          value='Upload'
          className='btn btn-primary btn-block mt-4'
        />
      </form>

      {file.map((item, index) => (
        <>
          <div className='main-progress-wrapper'>
          <h3>{item.name}</h3>
          <Progress percentage={uploadPercentage} />
          </div>
          </>
        ))}
      
    </Fragment>
  );
};

export default FileUpload;
