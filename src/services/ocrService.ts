import TextRecognition from '@react-native-ml-kit/text-recognition';

export const recognizeText = async (imageUri: string): Promise<{ success: boolean; text: string }> => {
  try {
    const result = await TextRecognition.recognize(imageUri);
    if (!result || !result.text) {
      return { success: false, text: '' };
    }
    return { success: true, text: result.text };
  } catch (error) {
    console.error("OCR Service Error:", error);
    return { success: false, text: '' };
  }
};