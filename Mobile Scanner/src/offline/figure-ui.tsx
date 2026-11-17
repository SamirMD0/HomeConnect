import { Text } from 'react-native';
import { theme } from '../theme';
export function FigureUpdated({at}:{at?:string}){return at?<Text style={{color:theme.colors.muted,fontSize:12}}>Last updated {new Date(at).toLocaleString()}</Text>:null;}
