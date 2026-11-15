import { Circle, Path, Rect, Svg } from 'react-native-svg';
import { Text, View, StyleSheet } from 'react-native';

type BrandProps = { brand: string; width?: number; height?: number };

/** Payment network marks are vector reproductions of the networks' recognizable marks. */
export function PaymentNetworkLogo({ brand, width = 58, height = 28 }: BrandProps) {
  const key = brand.toUpperCase();
  if (key.includes('VISA')) {
    return <Svg width={width} height={height} viewBox="0 0 24 24"><Path fill="#1A1F71" d="M9.112 8.262L5.97 15.758H3.92L2.374 9.775c-.094-.368-.175-.503-.461-.658C1.447 8.864.677 8.627 0 8.479l.046-.217h3.3a.904.904 0 01.894.764l.817 4.338 2.018-5.102zm8.033 5.049c.008-1.979-2.736-2.088-2.717-2.972.006-.269.262-.555.822-.628a3.66 3.66 0 011.913.336l.34-1.59a5.207 5.207 0 00-1.814-.333c-1.917 0-3.266 1.02-3.278 2.479-.012 1.079.963 1.68 1.698 2.04.756.367 1.01.603 1.006.931-.005.504-.602.725-1.16.734-.975.015-1.54-.263-1.992-.473l-.351 1.642c.453.208 1.289.39 2.156.398 2.037 0 3.37-1.006 3.377-2.564m5.061 2.447H24l-1.565-7.496h-1.656a.883.883 0 00-.826.55l-2.909 6.946h2.036l.405-1.12h2.488zm-2.163-2.656l1.02-2.815.588 2.815zm-8.16-4.84l-1.603 7.496H8.34l1.605-7.496z"/></Svg>;
  }
  if (key.includes('MASTER')) {
    return <Svg width={width} height={height} viewBox="0 0 48 30"><Circle cx="18" cy="15" r="13" fill="#EB001B"/><Circle cx="30" cy="15" r="13" fill="#F79E1B"/><Path d="M24 5.2a13 13 0 0 1 0 19.6 13 13 0 0 1 0-19.6Z" fill="#FF5F00"/></Svg>;
  }
  if (key.includes('AMEX')) {
    return <Svg width={width} height={height} viewBox="0 0 64 40"><Rect x="1" y="1" width="62" height="38" rx="5" fill="#176FC1"/><Path d="M8 13h48M8 20h48M8 27h48" stroke="#FFFFFF" strokeWidth="2"/><Path d="M14 8h36v24H14z" fill="none" stroke="#FFFFFF" strokeWidth="1.5"/></Svg>;
  }
  if (key.includes('DISCOVER')) {
    return <View style={[styles.discover,{width,height}]}><Text style={styles.discoverText}>DISCOVER</Text><View style={styles.discoverArc}/></View>;
  }
  return <View style={[styles.unknown,{width,height}]}><Text style={styles.unknownText}>CARD</Text></View>;
}

/** Full wallet/provider marks; these are not colour tiles with placeholder initials. */
export function WalletProviderLogo({ provider, width = 48, height = 42 }: { provider: string; width?: number; height?: number }) {
  const key = provider.toLowerCase();
  if (key.includes('orange')) {
    return <View style={[styles.providerWrap,{width,height}]}><Svg width={width} height={height} viewBox="0 0 48 42"><Rect x="3" y="2" width="42" height="38" rx="7" fill="#F58220"/><Path d="M10 29h28v3H10zm0-7h28v3H10zm0-7h28v3H10z" fill="#FFFFFF"/></Svg></View>;
  }
  if (key.includes('vodafone')) {
    return <View style={[styles.providerWrap,{width,height}]}><Svg width={width} height={height} viewBox="0 0 48 42"><Circle cx="24" cy="21" r="19" fill="#E60000"/><Path d="M30.8 5.8c.65 0 1.3.06 1.75.18-3.6.75-5.8 4.1-5.78 7.75 0 .08.01.18.02.27 5.8 1.42 8.4 4.9 8.4 9.75 0 4.85-3.75 10.15-10.2 10.15-5.2 0-10.6-4.45-10.6-11.55 0-4.75 2.6-9.3 5.85-11.95 3.2-2.55 7.05-4.6 10.56-4.6Z" fill="#FFFFFF"/></Svg></View>;
  }
  if (key.includes('etisalat')) {
    return <View style={[styles.wordLogo,{width,height}]}><Text style={styles.etisalat}>e&amp;</Text></View>;
  }
  return <View style={[styles.wordLogo,{width,height}]}><Text style={styles.we}>WE</Text><View style={styles.weUnderline}/></View>;
}

const styles = StyleSheet.create({
  discover:{justifyContent:'center',alignItems:'center',overflow:'hidden'},
  discoverText:{fontSize:10,fontWeight:'900',letterSpacing:0.4,color:'#111111'},
  discoverArc:{position:'absolute',right:3,bottom:0,width:24,height:9,borderRadius:12,backgroundColor:'#F58220',transform:[{rotate:'-12deg'}]},
  unknown:{justifyContent:'center',alignItems:'center',borderRadius:5,backgroundColor:'#F5F5F0'},
  unknownText:{fontSize:10,fontWeight:'900',color:'#183D32'},
  providerWrap:{alignItems:'center',justifyContent:'center'},
  wordLogo:{alignItems:'center',justifyContent:'center'},
  etisalat:{fontSize:27,fontWeight:'900',letterSpacing:-2,color:'#087B43'},
  we:{fontSize:25,fontWeight:'900',letterSpacing:-2,color:'#6B2D91'},
  weUnderline:{width:30,height:3,borderRadius:2,backgroundColor:'#6B2D91',marginTop:-2},
});
