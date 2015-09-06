## to download the jenkins configuration again, 
## you can simply use the following command:


## https://wiki.jenkins-ci.org/display/JENKINS/Authenticating+scripted+clients
wget -O config.xml --auth-no-challenge --http-user=**user** --http-password=**apiToken** --secure-protocol=TLSv1  http://domain+port/job/dir_ui/job/build_ui/config.xml
