Shairport-sync Node parser

About:

This node script reads from the shairport meta stream located in /tmp/

You have to install the development version of shairport-sync at this time, because
the git repo of shairport doesn't yet support meta data. 

https://github.com/mikebrady/shairport-sync/tree/development

Other than that, you must install all of the proper libraries that it will use. 

It should automatically start, in our case we used a raspberry pi in order to host, 
and we are sending the metadata to our slack channel and firebase storage for aux purposes.


