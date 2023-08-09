import Vol3dViewer from './Vol3dViewer';
import * as THREE from 'three';
import { openArray, HTTPStore } from 'zarr'
import React, { useEffect } from 'react';
import './CloudViewerUI.css';
import { Queue } from 'async-await-queue';


function CloudViewerUI() {
    const [zarrUrl, setZarrUrl] = React.useState('https://surfdrive.surf.nl/files/remote.php/nonshib-webdav/Ruisdael-viz/ql.zarr');
    const [dataUint8, setDataUint8] = React.useState(null);
    const dataShape = React.useRef([]);
    const dataCellSize = React.useRef([]);
    const allTimeSlices = React.useRef(new Array(10));
    const currentTimeIndex = React.useRef(0);

    const fetchData = async (url, variable, timeIndex) => {
        if (allTimeSlices.current[timeIndex]) {
            return;
        }
        const fetchOptions = { redirect: 'follow', mode: 'cors', credentials: 'include'};
        const supportedMethods = ['GET', 'HEAD'];
        const store = new HTTPStore(url, {fetchOptions, supportedMethods});
        const zarrdata = await openArray({store: store, path: variable, mode: "r"});
        console.log('downloading time slice', timeIndex, '...');
        const { data, strides, shape } = await zarrdata.getRaw([timeIndex, null, null, null]);
        console.log('...done.');
        allTimeSlices.current[timeIndex] = data;
        if ( timeIndex == 0 ){
          const zarrxvals = await openArray({store: store, path: 'xt', mode: "r"});
          const zarryvals = await openArray({store: store, path: 'yt', mode: "r"});
          const zarrzvals = await openArray({store: store, path: 'zt', mode: "r"});
          const xvals = await zarrxvals.getRaw([null]);
          const yvals = await zarryvals.getRaw([null]);
          const zvals = await zarrzvals.getRaw([null]);
          let xvalues = xvals.data;
          let dx = xvalues[1] - xvalues[0];
          let yvalues = yvals.data;
          let dy = yvalues[1] - yvalues[0];
          let zvalues = zvals.data;
          let sumDifferences = 0;
          for (let i = 1; i < zvalues.length; i++) {
            sumDifferences += Math.abs(zvalues[i] - zvalues[i - 1]);
          }
          let dz = sumDifferences / (zvalues.length - 1);
          console.log("I calculated ", dx, dy, dz);
          dataCellSize.current = [dx/dx, dy/dx, dz/dx];
          dataShape.current = [shape[1], shape[2] * (dy/dx), shape[0] * (dz/dx)];
        }
    }

    const fetchAllData = async (url, variable) => {
      console.log('here we go downloading data...')
      const q = new Queue(1, 5000);
      for (let i = 0; i < 10; ++i) {
        const me = Symbol();
        await q.wait(me, 10 - i);
        try {
            fetchData(url, variable, i);
        } catch (e) {
          console.error(e);
        } finally {
          q.end(me);
        }
      }
      return await q.flush();
    }

    useEffect(() => {
      fetchAllData(zarrUrl, 'ql');
    }, [zarrUrl]);

    useEffect(() => {
      const interval =  setInterval(() => {
        if (allTimeSlices.current[currentTimeIndex.current]){
          setDataUint8(allTimeSlices.current[currentTimeIndex.current]);
          currentTimeIndex.current = (currentTimeIndex.current + 1) % 10;
        }
      }, 1000);
      return () => clearInterval(interval);
      }, []);

    let viewer = null;
    if (dataUint8 && dataUint8.length != 0 && dataCellSize.current.length != 0) {
      viewer = (
          <Vol3dViewer
            volumeDataUint8={dataUint8}
            volumeSize={dataShape.current}
            voxelSize={dataCellSize.current}
            transferFunctionTex={makeCloudTransferTex()}
            dtScale={0.5}
          />
      );
    }
    return (
      <div className="BasicUI">
        <div
          className="Middle"
          tabIndex={0}
 //         onKeyDown={onKeyDown}
          role='link'>
          {viewer}
        </div>
      </div>); 
}

export function makeCloudTransferTex() {

  const width = 256;
  const height = 1;
  const size = width * height;
  const data = new Uint8Array(4 * size);

  for (let i = 0; i < width; i += 1) {

    let r = 0;
    let alpha = 0;

    if (i < 10)
    {
      r = 255;
      alpha = 30;
    }
    else if(i < 25)
    {
      r = 245;
      alpha = 100;
    }
    else if(i < 77)
    {
      r = 235;
      alpha = 200;
    }
    else if(i < 180)
    {
      r = 225;
      alpha = 250;
    }
    else
    {
      r = 215;
      alpha = 255;

    }
    data[4 * i] = r;
    data[4 * i + 1] = r;
    data[4 * i + 2] = r;
    data[4 * i + 3] = alpha;

  }
  console.log(data);

  const transferTexture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  transferTexture.wrapS = THREE.ClampToEdgeWrapping;
  transferTexture.wrapT = THREE.ClampToEdgeWrapping;
  transferTexture.needsUpdate = true;

  return transferTexture;
}

export default CloudViewerUI;