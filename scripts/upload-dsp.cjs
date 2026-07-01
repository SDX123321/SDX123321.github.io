const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const MAPPING = {
  '9E8D8D1A4F8DB921DBA2F537EBC561D4.jpg': 'ch3_dft_4point.jpg',
  '518002A613BB58BE18F1C9EE97080936.jpg': 'ch1_z_transform.jpg',
  '1C5C498FFB6765BDE814E2BD8F05E3B5.jpg': 'ch1_inverse_z.jpg',
  '9E80408F51376864E526D5BF55CE938D.jpg': 'ch1_linearity_convolution.jpg',
  'EAF22DABB212DA16316FD5A32EA39CA0.jpg': 'ch1_causality_stability.jpg',
  '8E1F1DDE9632ACA65728567D2F777746.jpg': 'ch1_system_stability.jpg',
  '82CAF620F1F798C5FE188CE54EC488D0.jpg': 'ch2_sampling_aliasing.jpg',
  '0213E1BF79848D02C03672D2F6F482D6.jpg': 'ch3_convolution_types.jpg',
  'B10E871D282C4CA3987C7C8DF97EF71A.jpg': 'ch3_fft_flowgraph.jpg',
  '99B1AB86AEB890C205981E908DE3504B.jpg': 'ch4_impulse_bilinear.jpg',
  'FBF407A135E182CA26532F5585D05C7C.jpg': 'ch4_butterworth.jpg',
  '4ABEF1BBFD2E0E0AA527700C494F26AA.jpg': 'ch5_window_fir.jpg',
  '0FE5B60CAF2F57D9BAB2EEE611747333.jpg': 'ch5_fir_analysis.jpg',
  '6975F7F6700FF88C32EA5F2F5DC8EB21.jpg': 'ch6_direct_structures.jpg',
  '57FEEED1B9D80F166618D8F347A64A8E.jpg': 'ch6_transverse_structure.jpg',
  'E0A0411CA74CA08F1ECBC17F1402AA58.jpg': 'ch6_multiple_structures.jpg',
  '23B677BDE5E52303F4F9444E2CFA4E49.jpg': 'ch6_quantization_noise.jpg',
  '570D4364F00992A0009B7DD83A4647B4.jpg': 'ch1_system_analysis.jpg',
  '55E1D9956C37EC3E32255AE054BB59B6.jpg': 'ch3_dft_duplicate.jpg',
  'read_img1.jpg': 'ch6_direct_structures_img.jpg',
  'read_img2.jpg': 'ch6_transverse_structure_img.jpg',
  'read_img3.jpg': 'ch6_multiple_structures_img.jpg',
  'read_img4.jpg': 'ch6_quantization_noise_img.jpg',
};

const SRC = 'C:/Users/zzz/Desktop/期末复习/数字信号处理/习题图片_jpg';

async function main() {
  for (const [srcName, destName] of Object.entries(MAPPING)) {
    const srcPath = SRC + '/' + srcName;
    if (!fs.existsSync(srcPath)) {
      console.log(`SKIP ${srcName} (not found)`);
      continue;
    }
    const key = `images/dsp-exercises/${destName}`;
    console.log(`Uploading ${srcName} → ${key}`);
    await s3.send(new PutObjectCommand({
      Bucket: 'web',
      Key: key,
      Body: fs.readFileSync(srcPath),
      ContentType: 'image/jpeg',
    }));
    console.log(`  OK`);
  }
  console.log('All done!');
}
main().catch(e => console.error(e));
