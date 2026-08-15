export type OcrResult = {
    text: string;
    success: boolean;
};

export async function recognizeText(imageUri: string): Promise<OcrResult> {
    // TODO: replace with real ML Kit text recognition
    // e.g. import TextRecognition from '@react-native-ml-kit/text-recognition'
    // const result = await TextRecognition.recognize(imageUri);
    // return { text: result.text, success: !!result.text };

    // Mock response for development
    await new Promise(resolve => setTimeout(resolve, 1200));
    return {
        text: 'OCR not yet implemented.\nInstall @react-native-ml-kit/text-recognition to enable real text recognition.',
        success: true,
    };
}
