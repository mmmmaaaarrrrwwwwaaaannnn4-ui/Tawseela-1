import { Circle, Path, Rect, Svg, Text as SvgText } from 'react-native-svg';
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
    return <Svg width={width} height={height} viewBox="0 0 64 40"><Rect x="1" y="1" width="62" height="38" rx="5" fill="#176FC1"/><SvgText x="32" y="25" textAnchor="middle" fill="#FFFFFF" fontSize="17" fontWeight="900" letterSpacing="-0.7">AMEX</SvgText><Path d="M4 11h56M4 29h56" stroke="#FFFFFF" strokeWidth="1.2" opacity={0.9}/></Svg>;
  }
  if (key.includes('MADA')) {
    return <View style={[styles.mada,{width,height}]}><View style={styles.madaMark}><View style={styles.madaDotGreen}/><View style={styles.madaDotBlue}/></View><Text style={styles.madaText}>مدى</Text></View>;
  }
  if (key.includes('DISCOVER')) {
    return <View style={[styles.discover,{width,height}]}><Text style={styles.discoverText}>DISCOVER</Text><View style={styles.discoverArc}/></View>;
  }
  return <View style={[styles.unknown,{width,height}]}><Text style={styles.unknownText}>CARD</Text></View>;
}

/** Full wallet/provider marks; these are not colour tiles with placeholder initials. */
export function WalletProviderLogo({ provider, width = 48, height = 42 }: { provider: string; width?: number; height?: number }) {
  const key = provider.toLowerCase();
  if (key.includes('insta')) {
    return <View style={[styles.wordLogo,{width,height}]}><Text style={styles.insta}>INSTA</Text><Text style={styles.instaPay}>PAY</Text></View>;
  }
  if (key.includes('tawseela') || key.includes('توصيلة')) {
    return <View style={[styles.providerWrap,{width,height,gap:1}]}><Svg width={width} height={height*0.68} viewBox="0 0 48 34"><Rect x={8} y={1} width={28} height={30} rx={4} fill="none" stroke="#E51D2A" strokeWidth={2.4}/><Path d="M13 7h18M13 24h18M18 16h8" stroke="#E51D2A" strokeWidth={2.1} strokeLinecap="round"/><Path d="M20 12c5-5 11-2 13 3-4 0-7 2-9 6" fill="none" stroke="#E51D2A" strokeWidth={2.2}/></Svg><Text style={styles.cashText}>توصيلة</Text></View>;
  }
  if (key.includes('orange')) {
    return <View style={[styles.providerWrap,{width,height,gap:0}]}><Svg width={width*0.68} height={height*0.52} viewBox="0 0 48 36"><Path d="M5 28L25 8H12V2h27v27h-6V16L13 36Z" fill="#101010"/><Path d="M26 8h13v21h-6V16L20 32l-5-5Z" fill="#F58220"/></Svg><Text style={styles.orangeText}>Orange</Text><Text style={styles.orangeText}>Money</Text></View>;
  }
  if (key.includes('vodafone')) {
    return <View style={[styles.providerWrap,{width,height}]}><Svg width={width} height={height} viewBox="0 0 48 42"><Circle cx="24" cy="21" r="19" fill="#E60000"/><Path d="M30.8 5.8c.65 0 1.3.06 1.75.18-3.6.75-5.8 4.1-5.78 7.75 0 .08.01.18.02.27 5.8 1.42 8.4 4.9 8.4 9.75 0 4.85-3.75 10.15-10.2 10.15-5.2 0-10.6-4.45-10.6-11.55 0-4.75 2.6-9.3 5.85-11.95 3.2-2.55 7.05-4.6 10.56-4.6Z" fill="#FFFFFF"/></Svg></View>;
  }
  if (key.includes('etisalat')) {
    return <View style={[styles.wordLogo,{width,height,gap:0}]}><Text style={styles.etisalat}>e&amp;</Text><Text style={styles.etisalatSub}>etisalat and</Text></View>;
  }
  return <View style={[styles.wordLogo,{width,height,gap:0}]}><Text style={styles.we}>we</Text><View style={styles.wePay}><Text style={styles.wePayText}>Pay</Text></View></View>;
}

const styles = StyleSheet.create({
  discover:{justifyContent:'center',alignItems:'center',overflow:'hidden'},
  discoverText:{fontSize:10,fontWeight:'900',letterSpacing:0.4,color:'#111111'},
  discoverArc:{position:'absolute',right:3,bottom:0,width:24,height:9,borderRadius:12,backgroundColor:'#F58220',transform:[{rotate:'-12deg'}]},
  unknown:{justifyContent:'center',alignItems:'center',borderRadius:5,backgroundColor:'#F5F5F0'},
  unknownText:{fontSize:10,fontWeight:'900',color:'#183D32'},
  providerWrap:{alignItems:'center',justifyContent:'center'},
  wordLogo:{alignItems:'center',justifyContent:'center'},
  etisalat:{fontSize:27,fontWeight:'900',letterSpacing:-2,color:'#E60012',lineHeight:28},
  etisalatSub:{fontSize:8,fontWeight:'800',color:'#E60012',lineHeight:10},
  orangeText:{fontSize:9,fontWeight:'900',color:'#111111',lineHeight:10},
  cashText:{fontSize:9,fontWeight:'900',color:'#E51D2A',lineHeight:10},
  mada:{alignItems:'center',justifyContent:'center',gap:0},
  madaMark:{flexDirection:'row',alignItems:'center',gap:2},
  madaDotGreen:{width:10,height:10,borderRadius:3,backgroundColor:'#0B9D66'},
  madaDotBlue:{width:10,height:10,borderRadius:3,backgroundColor:'#176FC1'},
  madaText:{fontSize:10,fontWeight:'900',color:'#087A55'},
  insta:{fontSize:12,fontWeight:'900',fontStyle:'italic',color:'#5B2589',lineHeight:13},
  instaPay:{fontSize:12,fontWeight:'900',fontStyle:'italic',color:'#F18B24',lineHeight:13},
  we:{fontSize:25,fontWeight:'500',letterSpacing:-2,color:'#8A8A8A'},
  wePay:{minWidth:34,height:15,borderRadius:4,backgroundColor:'#6B2D91',alignItems:'center',justifyContent:'center',paddingHorizontal:4,marginTop:-2},
  wePayText:{fontSize:11,fontWeight:'700',fontStyle:'italic',color:'#FFFFFF',lineHeight:13},
});
